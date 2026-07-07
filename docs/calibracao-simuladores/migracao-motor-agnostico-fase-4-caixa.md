# Migração para o Motor Agnóstico — Fase 4: Caixa (concluída)

> Escopo estrito desta fase: **só arquitetura**. Nenhuma taxa, LTV, prazo,
> MIP, DFI, programa ou regra de elegibilidade foi alterada. A Base de
> Critérios da Caixa (`docs/calibracao-simuladores/base-criterios-caixa.md`/
> `.json`) foi usada só como referência de organização/nomenclatura — nenhum
> valor dela foi aplicado ao código. Calibração fica para uma sprint
> separada, futura, que usará essa mesma Base de Critérios como checklist.

## Arquivos alterados

- `src/lib/simuladorFinanciamento/criteria-resolver.ts` — `resolverCriterios` passou a
  produzir um `SimulationCriteria` completo para `'caixa'`; nova função
  `estrategiaMipCaixaSbpe()`; `BancoFase4Id`/`BANCOS_FASE4` adicionados à união
  `BancoComCriteriosId`/`BANCOS_COM_CRITERIOS` (que agora cobre os 7 bancos —
  `ehBancoComCriterios` deixa de ter exceção).
- `src/lib/simuladorFinanciamento/engine.ts` — `calcularSACCaixa`/`calcularPRICECaixa`/
  `getCaixaMipRate` removidas e substituídas por
  `calcularSACComTarifaMensalFixa`/`calcularPRICEComTarifaMensalFixa` (genéricas,
  parametrizadas pelo critério); novo ramo de dispatch em `simularComCriterios` por
  `!criteria.seguro.incluirNaUltimaParcela`; `simularBancoComTaxa` virou um wrapper fino
  (todo bank agora passa pelo caminho de critérios, os parâmetros `taxaAnual`/`programa`/
  `mipOverride` deixaram de ser lidos); `simularBanco` e `simularCaixaDuplo` reescritas
  para montar as variações de programa da Caixa (Pró-Cotista/MCMV/SBPE) compondo o
  critério base em vez de passar taxa/programa/mipOverride soltos.
- `src/lib/simuladorFinanciamento/criteria.ts` — **não alterado**. Os campos usados nesta
  fase (`ltv.penalidadeImovelUsado`, `seguro.incluirNaUltimaParcela`,
  `tarifaAdministracaoMensal`, `EstrategiaSeguroMip` tipo `'teto-idade'`) já existiam desde
  a Fase 1/2, criados antecipadamente para este momento e nunca antes populados/consumidos
  de fato por nenhum banco.
- `src/lib/simuladorFinanciamento/__tests__/criteria-migracao-fase4-caixa.test.ts` — novo,
  prova de equivalência (ver seção abaixo).
- `src/lib/simuladorFinanciamento/__tests__/_baseline-fase4-caixa/` — novo, cópia
  congelada do `engine.ts`/`criteria-resolver.ts` de antes desta fase, usada só pelo teste
  de equivalência.

## Banco migrado

**Caixa** — o único banco que restava no caminho hardcoded (`cfg.id === 'caixa'` dentro de
`simularBancoComTaxa`). Diferente das Fases 1–3, a Caixa não tinha *uma* particularidade de
cálculo, tinha duas coisas ao mesmo tempo: (a) uma função de cálculo própria
(`calcularSACCaixa`/`calcularPRICECaixa`, com MIP/DFI zerados na última parcela e uma
tarifa de administração mensal fixa — R$25/mês — somada em toda parcela) e (b) múltiplos
programas por trás do mesmo "banco" (SBPE, Pró-Cotista, MCMV por faixa), orquestrados por
`simularCaixaDuplo`.

### Por que não virou um `ProgramaEspecial`

O tipo `SimulationCriteria` já tem um campo `programasEspeciais?: ProgramaEspecial[]`
(criado na Fase 1, nunca usado). Cheguei a considerar modelar Pró-Cotista/MCMV como
`ProgramaEspecial[]`, mas a instrução desta fase é explícita: **não iniciar Programas
Especiais**. Além disso, cada "programa" da Caixa hoje é só uma troca pontual de
taxa/programa/estratégia de MIP sobre o **mesmo** critério base (mesmo LTV, mesmo prazo,
mesmo DFI, mesma tarifa, mesmo comprometimento de renda) — não há elegibilidade,
LTV ou prazo próprios por programa no código atual. Modelar isso como
`ProgramaEspecial[]` exigiria decidir uma forma de representar "critério parcial que
sobrescreve campos específicos do critério base", o que é uma decisão de arquitetura nova,
não uma migração de comportamento existente. Por isso `simularCaixaDuplo`/`simularBanco`
continuam responsáveis por decidir qual programa se aplica e montar a variação do critério
localmente — exatamente o que já faziam antes (decidiam qual taxa/programa passar para
`simularBancoComTaxa`), só que agora compõem um objeto de critério em vez de passar valores
soltos.

### Duas correções necessárias para equivalência exata (não são mudança de regra)

1. **`dfi.taxaMensal` da Caixa ignora `overrides?.dfiRate`.** As funções originais
   `calcularSACCaixa`/`calcularPRICECaixa` nunca recebiam um parâmetro de override de DFI —
   liam `CAIXA_DFI_RATE` direto, sempre. Isso significa que, hoje em produção, um override
   de `dfiRate` configurado no banco de dados para a Caixa **já não tem efeito nenhum** — um
   comportamento pré-existente (provavelmente não intencional, mas real). Preservado de
   propósito, do mesmo jeito que o Itaú já preservava a mesma limitação para `mipRate`/
   `dfiRate` desde a Fase 3.
2. **`ltv.price` passou a respeitar `overrides?.maxLtv`.** O resolvedor genérico (desde a
   Fase 1) tinha `price: cfg.maxLtvPrice`, sem consultar o override — mas nenhum banco
   migrado até agora tinha um `maxLtvPrice` real definido, então essa lacuna nunca havia
   sido exercitada. A fórmula original da Caixa (`overrides?.maxLtv ?? cfg.maxLtvPrice ??
   cfg.maxLtv`) **respeitava** o override também para PRICE. Ajustei a linha compartilhada
   para `overrides?.maxLtv ?? cfg.maxLtvPrice` — confirmado, por inspeção, que isso não
   muda nada para nenhum dos 6 bancos já migrados (nenhum deles tem `maxLtvPrice` definido
   em `BANCOS_CONFIG`, então o novo formato resolve exatamente para o mesmo `undefined` que
   antes, a menos que um override de LTV esteja presente — caso em que o resultado também é
   idêntico ao antigo, porque a branch antiga caía no mesmo `overrides.maxLtv` via `sac`).

## Prova de equivalência

Como a migração já havia sido aplicada ao `engine.ts`/`criteria-resolver.ts` no momento em
que a necessidade de um teste de equivalência foi identificada, não foi possível capturar
um snapshot "antes" a partir de uma execução real do código antigo, como nas Fases 1–3.
Em vez disso, reconstruí uma cópia **byte a byte** do `engine.ts` e do `criteria-resolver.ts`
exatamente como estavam antes desta fase (a partir do conteúdo já lido, verbatim, no início
da sessão, antes de qualquer edição) em
`src/lib/simuladorFinanciamento/__tests__/_baseline-fase4-caixa/`. O teste
`criteria-migracao-fase4-caixa.test.ts` importa as duas versões lado a lado (`simularBanco`/
`simularTodosBancos` antigo e novo) e roda a **mesma matriz de cenários** nas duas,
comparando os resultados numéricos campo a campo (`primeiraParcela`, `ultimaParcela`,
`totalJuros`, `totalSeguros`, `totalPago`, `taxaMensal`, `taxaAnual`, `maxFinanciavel30`,
`elegivel`, `motivoInelegivel`, `programa`, etc.) — não apenas um snapshot serializado, mas
uma comparação direta ponto a ponto entre as duas implementações.

Cobertura da matriz de cenários (53 testes, todos passando):

- SAC e PRICE, com e sem correntista.
- LTV no limite exato (80% SAC / 70% PRICE) e acima do limite (inelegível).
- Imóvel usado (penalidade de 10pp no LTV), dentro e fora do novo limite.
- Varredura de idade cobrindo **todas** as faixas de `CAIXA_MIP_RATES` (30/35/40/45/50/55/
  60/65/999), incluindo as fronteiras exatas de cada teto — garante que
  `estrategiaMipCaixaSbpe()` + `resolverTaxaMip('teto-idade')` bate, idade por idade, com o
  antigo `getCaixaMipRate`.
- Idade ≥ 80 anos (inelegível) e idade avançada com prazo reduzido pela regra idade+prazo.
- Valor do imóvel acima do teto SFH (2,25M) e entrada ≥ valor do imóvel (inelegível).
- Pró-Cotista isolado, MCMV isolado (3 faixas testadas: 1, 3 e Classe Média), e a
  combinação Pró-Cotista + MCMV + SBPE simultaneamente elegíveis.
- Bloqueio de MCMV/Pró-Cotista em `lote_urbanizado`, `comercial`, `jaRecebeuSubsidio=true`
  e `usaFgts=false` (este último bloqueia só o Pró-Cotista, não o MCMV — comportamento
  original preservado).
- Overrides do banco de dados: `taxaAnual`, `maxLtv` (SAC e PRICE), `mipRate`,
  `dfiRate` (confirmando que **continua sendo ignorado** — quirk preservado), e
  `prazoMaximoMeses`.
- `simularTodosBancos` com `bancosIds: ['caixa']`, comparando a lista completa de
  resultados (`resultadoId` a `resultadoId`) entre as duas implementações, não só um
  resultado isolado.

```bash
npx vitest run src/lib/simuladorFinanciamento/__tests__/criteria-migracao-fase4-caixa.test.ts
# Test Files  1 passed (1)
#      Tests  53 passed (53)
```

Suíte completa do módulo (inclui as snapshots das Fases 1–3, que continuam intocadas, e o
teste pré-existente `amortizacao.test.ts`, que já exercitava `simularBanco('caixa', ...)`
diretamente):

```bash
npx vitest run src/lib/simuladorFinanciamento
# Test Files  5 passed (5)
#      Tests  162 passed (162)
```

Suíte completa do repositório (garante que nada em `motor-simulacao.ts`/workflows quebrou):

```bash
npx vitest run
# Test Files  8 passed (8)
#      Tests  183 passed (183)
```

`npx tsc --noEmit -p tsconfig.json` — limpo, sem erros.

## Casos-âncora

`docs/calibracao-simuladores/casos-ancora/caixa-casos.json` já registrava, desde a análise
das planilhas de bancos, que **não existe simulador oficial da Caixa (planilha/XLS) no
projeto** — só os normativos textuais analisados na Base de Critérios. Isso significa que
não é possível, com o material hoje disponível, cravar um caso-âncora numérico validado
contra um simulador real da Caixa (como foi feito para Itaú, Bradesco, etc.).

O que esta fase adiciona ao arquivo de casos-âncora é diferente em natureza: não são
números validados contra um simulador oficial, são **cenários de equivalência
arquitetural** — a prova de que o motor novo reproduz exatamente o motor antigo, para uma
matriz ampla de situações (ver seção anterior). Isso substitui, para fins desta fase
("obter equivalência de comportamento"), a necessidade de um caso-âncora externo — o
"padrão-ouro" aqui é o próprio motor anterior, não um simulador terceiro. A validação
contra um simulador real da Caixa continua pendente e fica marcada como pré-requisito da
Sprint de Calibração (ver checklist abaixo).

## O que NÃO foi feito nesta fase (de propósito)

- Nenhum valor de taxa, LTV, prazo, MIP, DFI, tarifa ou teto foi alterado.
- Nenhuma das lacunas/conflitos da Base de Critérios (idade+prazo não confirmada em
  nenhum normativo, `CAIXA_PRO_COTISTA.maxValorImovel` divergente do MO30824,
  granularidade do MCMV, alíquotas de MIP/DFI do produto SBPE ainda não confirmadas) foi
  investigada ou corrigida.
- Nenhum `ProgramaEspecial` foi criado ou populado.
- Nenhuma mudança em `criteria.ts` (o contrato `SimulationCriteria` já suportava tudo que
  esta fase precisava).

## Checklist para a Sprint de Calibração da Caixa (próxima etapa, separada)

Baseado diretamente em `docs/calibracao-simuladores/base-criterios-caixa.md` (seções 9–11)
e `delta-base-caixa.md` (seções 6–7) — não repetido aqui em detalhe, só referenciado:

1. Confirmar (ou obter) as alíquotas de MIP/DFI do produto **SBPE** — hoje calibradas do
   simulador oficial, não confirmadas pelos 6 normativos analisados (o MO30824 só cobre
   FGTS/PMCMV, um produto diferente).
2. Confirmar o valor exato da Tarifa de Administração (R$25/mês) para o público SBPE geral
   — hoje só há um indício indireto via o desconto de FGTS/PMCMV.
3. Investigar a divergência `CAIXA_PRO_COTISTA.maxValorImovel = 350.000` (código) vs.
   `R$500.000` (MO30824 v040).
4. Decidir se vale modelar a granularidade completa do MCMV (faixa × porte de município)
   ou manter a simplificação atual de `MCMV_FAIXAS`.
5. Buscar confirmação da regra de idade/idade+prazo — ausente em todos os normativos
   analisados até agora, incluindo o manual de risco de crédito dedicado (MO43062).
6. Só depois de calibrar, avaliar se algum dos programas (Pró-Cotista, MCMV, Taxa
   Customizada) justifica virar um `ProgramaEspecial` de fato, ou se a composição local
   de critério (como implementada nesta fase) é suficiente a longo prazo.
7. ~~Validar a penalidade de -10pp de LTV para imóvel usado contra um simulador oficial~~
   — **resolvido em 2026-07-07, ver seção "Remoção da penalidade de LTV para imóvel
   usado" abaixo.**

## Correção de prazo PRICE (pós-Fase 4, 2026-07-07)

O MO30769 v032 ("Condições do Crédito Imobiliário PF – CCSBPE e Recursos Livres"), seção
3.3, confirma que o teto de prazo da Caixa **difere por sistema de amortização** para
Aquisição Residencial TR: SAC 120–420 meses, **PRICE 120–360 meses**. O motor (antes desta
correção) usava `prazoMaximoMeses = 420` para os dois, herdado do único campo que existia
em `SimulationCriteria` — toda simulação PRICE da Caixa respondia com até 60 meses a mais
de prazo do que o produto permite.

Corrigido com um novo campo opcional `prazoMaximoMesesPrice` em `SimulationCriteria`
(`criteria.ts`), populado só para a Caixa em `criteria-resolver.ts` (`ehCaixa ? 360 :
undefined`) e consumido em `simularComCriterios` (`engine.ts`): quando
`input.tipoAmortizacao === 'PRICE'` e o campo está definido, ele substitui
`prazoMaximoMeses` como teto antes da regra de idade+prazo — nenhum outro banco é afetado
(campo `undefined` cai no comportamento de sempre). Overrides de `prazoMaximoMeses` do
banco de dados continuam valendo normalmente para SAC, mas não abrem exceção ao teto de
360 do PRICE (é uma regra normativa, não um parâmetro calibrável por banco).

**Por que é correção normativa, não calibração**: o valor vem de um documento oficial da
Caixa (não de um simulador terceirizado nem de uma estimativa), então foi aplicado
diretamente — diferente da penalidade de imóvel usado (resolvida separadamente, ver
seção abaixo) e das demais pendências deste checklist, que seguem sem lastro documental
e aguardam a Sprint de Calibração.

## Remoção da penalidade de LTV para imóvel usado (pós-Fase 4, 2026-07-07)

`penalidadeImovelUsado = 0.10` (redução de 10pp no LTV para imóvel usado, exclusiva da
Caixa) era um comportamento herdado do código hardcoded original, preservado sem alteração
durante a migração da Fase 4 — mas **nunca teve lastro em nenhum normativo analisado**
(`base-criterios-caixa.md`, seção 13: "Ainda não encontrada em nenhum documento", 5
documentos verificados).

Removido depois de uma simulação real no simulador oficial da Caixa (SBPE, imóvel usado,
com relacionamento, R$430.000, renda R$15.971,82, nascimento 04/08/1995, Maringá-PR):
cota máxima **SAC 80% e PRICE 70%** — idênticas às cotas de imóvel **novo**. Não há
nenhuma redução para imóvel usado na Caixa; o parâmetro estava simplesmente incorreto.

Efeito colateral corrigido de brinde: a penalidade fantasma fazia o motor rejeitar como
"nenhum banco elegível" simulações legítimas de imóvel usado nas quais o valor financiado
ficava entre 70-80% do imóvel (dentro do LTV real, fora do LTV fictício com penalidade) —
e a mensagem de diagnóstico de "nenhum banco elegível" atribuía a rejeição à renda
(`montarRespostaNormal`/`calcularAnalise`), quando a causa real era essa penalidade
inexistente. Achado durante uma simulação de suporte ao usuário (`*simula`, Caixa, imóvel
usado, "financiando valor máximo", PRICE) que retornava inelegível para os dois sistemas.

**Validação de precisão**: com a penalidade removida, o mesmo cenário real foi recalculado
pelo motor e comparado campo a campo contra o simulador oficial — 1ª parcela SAC
99,97% de acerto (R$3.984,38 vs. R$3.985,59 real), última parcela SAC 99,99%
(R$851,32 vs. R$851,38), 1ª parcela PRICE 99,96% (R$2.892,04 vs. R$2.890,86), última
parcela PRICE 99,28% (R$2.813,09 vs. R$2.833,58) — todos acima do teto de 95-98% pedido,
sem precisar recalibrar MIP/DFI/tarifa/taxa (já estavam corretos; só a elegibilidade
LTV estava quebrada). Testado em `criteria-migracao-fase4-caixa.test.ts`, describe
`"LTV de imóvel usado (sem penalidade — confirmado por simulação real)"`.

`CriteriosLtv.penalidadeImovelUsado` (`criteria.ts`) continua existindo como campo do
tipo — é um ponto de extensão genérico, não uma constatação de que algum banco precisa
dele hoje. Nenhum banco o popula agora.

Testado em `criteria-migracao-fase4-caixa.test.ts`, describe `"teto de prazo PRICE (360
meses — MO30769 v032)"`: SAC continua 420, PRICE cai para 360 (inclusive combinado com
Pró-Cotista, override de LTV, override de `prazoMaximoMeses` e a regra de idade+prazo,
que pode reduzir ainda mais). Os cenários PRICE que antes viviam nos describes de
equivalência genérica foram movidos para lá, já que passaram a divergir de propósito do
baseline congelado (que nunca teve essa distinção). `npx tsc --noEmit` limpo, suíte
completa 185/185 (era 183/183 antes desta correção — 2 testes novos líquidos, o describe
novo tem 6 casos, 4 vieram dos describes de equivalência que perderam esses cenários).

## Item de evolução (backlog, não implementado): PDF comparativo SAC×PRICE para a Caixa

Registrado a pedido do usuário em 2026-07-07, junto da correção de prazo PRICE acima:
como a Caixa opera fortemente com a escolha entre SAC e PRICE (ambos suportados,
`amortizacoesSuportadas` já inclui os dois, tetos de prazo agora diferentes entre si — ver
seção anterior), faz sentido que a simulação da Caixa retorne automaticamente os dois
cenários (SAC e PRICE) no mesmo PDF, em vez de exigir duas simulações separadas para
comparar.

**Não implementado nesta sessão** — só o registro do item. Pontos de entrada prováveis
para uma implementação futura: `gerarPDFBuffer.ts` (geração server-side) e
`src/lib/workflows/motor-simulacao.ts` (orquestração da simulação via WhatsApp/`*simula`),
que hoje chamam `simularBanco`/`simularTodosBancos` com um único `tipoAmortizacao` por
chamada. Precisa de decisão de produto sobre layout (2 seções no mesmo PDF vs. tabela
comparativa) antes de iniciar — fora do escopo desta correção.
