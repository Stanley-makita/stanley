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
