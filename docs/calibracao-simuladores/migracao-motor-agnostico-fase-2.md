# Migração para o Motor Agnóstico — Fase 2 (concluída)

> Implementação da Fase 2 proposta em `docs/calibracao-simuladores/arquitetura-motor-agnostico.md`. Objetivo: migrar Inter e Daycoval para `SimulationCriteria` sem alterar nenhum resultado de simulação — nenhuma correção da taxa/prazo suspeitos do Inter apontados em `plano-calibracao.md`. Caixa e Itaú **não foram tocados**.

Data: 2026-07-06.

---

## Arquivos alterados

| Arquivo | O que mudou |
|---|---|
| `src/lib/simuladorFinanciamento/criteria-resolver.ts` | `resolverCriterios` ampliado para aceitar `BancoComCriteriosId = BancoGenericoId \| 'inter' \| 'daycoval'` (antes só `BancoGenericoId`). Adicionados os tipos `BancoFase2Id`, a lista `BANCOS_FASE2`, e a união `BANCOS_COM_CRITERIOS`/`BancoComCriteriosId` que substitui `BANCOS_GENERICOS`/`BancoGenericoId` como escopo aceito pela função. `ehBancoGenerico` renomeado para `ehBancoComCriterios` (mesma função, escopo ampliado). Nova função interna `estrategiaMipInter()` que traduz `INTER_MIP_SOMPO` para o formato genérico `'teto-idade'` do tipo `EstrategiaSeguroMip` (só troca o nome do campo `maxAge` → `tetoIdade`, nenhum valor muda). O corpo de `resolverCriterios` ganhou 2 seleções (`mipPadrao`/`dfiPadrao`) que escolhem a estratégia de seguro certa por banco — Bradesco/Santander/BB continuam recebendo exatamente o que recebiam na Fase 1. |
| `src/lib/simuladorFinanciamento/engine.ts` | (1) `resolverTaxaMip` ganhou a implementação do caso `'teto-idade'` (antes lançava erro) — replica exatamente a lógica de `getCaixaMipRate`/`getInterMipRate` (primeira faixa cujo teto de idade comporta o cliente). (2) O `if (ehBancoComCriterios(cfg.id))` em `simularBancoComTaxa` (que antes só pegava Bradesco/Santander/BB) agora também intercepta Inter e Daycoval antes de qualquer lógica hardcoded. (3) Como consequência, os antigos ramos `cfg.id === 'inter'`/`cfg.id === 'daycoval'` dentro do cálculo de MIP e DFI em `simularBancoComTaxa` — que nunca mais são alcançados em runtime — foram removidos (o TypeScript já não permitia essas comparações, por provar que `cfg.id` só pode ser `'caixa' \| 'itau'` naquele ponto do código após o `if` de interceptação). A função `getInterMipRate` (agora sem nenhum chamador) foi removida, junto com os imports `INTER_MIP_SOMPO`, `INTER_DFI_RATE`, `DAYCOVAL_MIP_RATE`, `DAYCOVAL_DFI_RATE` (que só eram usados ali). `getCaixaMipRate` foi mantida (ainda usada pela Caixa). |
| `src/lib/simuladorFinanciamento/__tests__/criteria-migracao-fase2.test.ts` | **Novo.** 23 casos de regressão (12 Inter + 11 Daycoval) via `toMatchSnapshot()`. |
| `docs/calibracao-simuladores/migracao-motor-agnostico-fase-2.md` | Este documento. |

`criteria.ts` **não precisou de nenhuma alteração** — o tipo `EstrategiaSeguroMip` já continha a variante `'teto-idade'` desde a Fase 1 (prevista na proposta arquitetural exatamente para este caso), só faltava implementar o dispatcher em `engine.ts`.

---

## Bancos migrados

| Banco | Antes | Depois |
|---|---|---|
| **Inter** | `simularBancoComTaxa`, MIP via `getInterMipRate` (tabela `INTER_MIP_SOMPO` por teto de idade), DFI via constante `INTER_DFI_RATE` — ambos selecionados por `cfg.id === 'inter'` | `simularComCriterios`, a partir de `resolverCriterios('inter', overrides)` — MIP como estratégia `'teto-idade'` (mesma tabela, traduzida), DFI como `criteria.seguro.dfi.taxaMensal = INTER_DFI_RATE` — nenhuma leitura de `cfg.id` no caminho de cálculo |
| **Daycoval** | Idem, com MIP via constante flat `DAYCOVAL_MIP_RATE` e DFI via `DAYCOVAL_DFI_RATE` | Idem, com MIP como estratégia `'flat'` (já suportada desde a Fase 1, usada também pelo caso de override de `mipRate` do banco de dados) e DFI análogo ao Inter |

**Confirmado durante a implementação**: nem Inter nem Daycoval têm função de cálculo própria — os dois já usavam `calcularSAC`/`calcularPRICE` genéricas (a mesma função que Bradesco/Santander/BB usam), só divergindo na escolha de MIP/DFI. Isso tornou a Fase 2 estruturalmente mais simples que o previsto: não foi necessário estender `simularComCriterios` (a função já escrita na Fase 1 já cobria tudo), só o dispatcher de estratégia de seguro precisou crescer.

**Não migrado nesta fase** (permanece exatamente como estava): Caixa (função de cálculo própria + múltiplos programas) e Itaú (função de cálculo própria + MIP bifásico + truncamento de taxa + ITBI) — previstos para as Fases 3 e 4.

---

## Prova de equivalência antes/depois

### Incidente durante a implementação (registrado para transparência)

A primeira tentativa de captura de baseline saiu **errada** e foi descartada antes de qualquer validação final. Ao corrigir os erros de compilação do TypeScript (que passou a apontar `cfg.id === 'inter'`/`'daycoval'` como comparações impossíveis, já que o `if` de interceptação provava que `cfg.id` só podia ser `'caixa'`/`'itau'` dali em diante), os ramos de MIP/DFI específicos do Inter e do Daycoval foram removidos do caminho antigo **antes** de eu ter capturado o snapshot de baseline desses dois bancos. Resultado: a primeira captura de baseline foi feita contra um caminho antigo já sem a lógica de MIP/DFI do Inter/Daycoval (caindo nos valores genéricos por engano) — não contra o comportamento real de produção.

O problema apareceu exatamente como deveria: ao reativar a migração e rodar a suíte, **14 dos 23 testes falharam**, com diffs de `totalSeguros`/`maxFinanciavel30`/`primeiraParcela` claramente incompatíveis com as tabelas reais do Inter/Daycoval. Isso confirmou que o motor migrado estava, na verdade, **correto** (usando `INTER_MIP_SOMPO`/`INTER_DFI_RATE`/`DAYCOVAL_MIP_RATE`/`DAYCOVAL_DFI_RATE` de verdade) e que o snapshot de baseline é que estava errado.

Correção aplicada: reintroduzi temporariamente a lógica original completa (função `getInterMipRateTemp` idêntica à antiga `getInterMipRate`, os imports e ramos de `cfg.id` removidos, com a migração de Inter/Daycoval desativada só para essa captura), recapturei os 26 snapshots corretos, revertei todo o código temporário de volta ao estado limpo (sem nenhum vestígio — verificado por busca por `TEMP-BASELINE` no código final, zero ocorrências) e só então rodei a suíte final com a migração ativa.

### Execução final

```
# Baseline recapturado com a lógica original real do Inter/Daycoval (temporariamente restaurada)
$ npx vitest run src/lib/simuladorFinanciamento/__tests__/criteria-migracao-fase2.test.ts
 Snapshots  26 written
 Tests  23 passed (23)

# Código revertido ao estado limpo (migração ativa, sem nenhum artefato temporário)
$ npx tsc --noEmit -p tsconfig.json
(sem erros)

# Suíte completa com a migração ativa, comparando contra os snapshots corretos
$ npx vitest run
 Test Files  6 passed (6)
      Tests  109 passed (109)
```

Os 109 testes incluem os 45 snapshots da Fase 1 (Bradesco/Santander/BB, confirmando que a Fase 2 não os afetou), os 23 novos da Fase 2 (Inter/Daycoval, batendo exatamente com o baseline recapturado), e os 41 testes pré-existentes do projeto (`amortizacao.test.ts` e outros).

**Cobertura dos 23 casos**: aquisição residencial padrão, correntista, imóvel usado, prazo máximo atual (420 meses Inter / 360 meses Daycoval, cliente jovem), idade próxima ao limite (78 anos), idade no corte duro de 80 anos, LTV no limite e acima do limite, PRICE (inelegível nos dois bancos), renda baixa, teto de imóvel (Daycoval, R$ 1.000.000), overrides de banco de dados (taxa/LTV/prazo/MIP/DFI), verificação específica de que a tabela de MIP do Inter varia corretamente por várias faixas etárias (Sompo), e verificação de que o MIP flat do Daycoval realmente não varia com a idade.

---

## Riscos restantes

Os riscos já registrados em `migracao-motor-agnostico-fase-1.md` (duplicação temporária de lógica entre `simularComCriterios` e `simularBancoComTaxa`; erros em runtime em vez de compile-time para estratégias não implementadas; necessidade de reavaliar a lista de bancos migrados se um deles ganhar especialização própria) continuam válidos e agora se aplicam também a Inter e Daycoval. Além deles:

1. **O incidente de captura de baseline** (seção acima) mostra que, quando o TypeScript força a remoção de um ramo de código por prová-lo inalcançável, a ordem de operações importa: remover o código "morto" do caminho antigo **antes** de capturar o baseline contamina a prova de equivalência. Nas próximas fases (Itaú, Caixa), a captura de baseline deve ser sempre o primeiro passo, e qualquer ajuste que o TypeScript exigir no caminho antigo (por causa da interceptação anterior) deve ser adiado até depois da captura — não antes.
2. **A tradução `INTER_MIP_SOMPO` → `EstrategiaSeguroMip` acontece em runtime, a cada chamada de `resolverCriterios('inter', ...)`** (a função `estrategiaMipInter()` remapeia o array inteiro toda vez). Isso é irrelevante em termos de performance (array pequeno, 11 itens), mas é uma pequena ineficiência que poderia virar uma constante pré-calculada se `resolverCriterios` for chamado em volume alto (ex.: comparação de múltiplos prazos, já existente no motor de simulação — ver `motor-simulacao.ts:executarSimulacaoComparativaPrazos`).
3. **Nenhum dado de calibração mudou** — reforçando o mesmo ponto da Fase 1: esta fase não resolve a suspeita de taxa/prazo do Inter identificada em `plano-calibracao.md`. Isso é esperado e intencional.

---

## Próximos passos

1. **Fase 3** (Itaú): o mais arriscado dos dois bancos restantes, por ter função de cálculo própria (`calcularSACItau`/`calcularPRICEItau`) com comportamento genuinamente diferente da fórmula genérica — pré-pagamento de seguros no "mês 0", MIP/DFI zerados na última parcela, DFI sobre valor de avaliação (não sobre valor do imóvel), truncamento de taxa de 15 casas, e ITBI incorporável. Ao contrário da Fase 2, aqui `simularComCriterios` provavelmente precisará ser estendida (não só o dispatcher de MIP) para suportar esses comportamentos via os campos já reservados em `criteria.ts` (`prePagamentoNoMesZero`, `incluirNaUltimaParcela`, `seguro.dfi.base`, `itbi`, `metodoConversaoTaxa`). Validação deve ser mês a mês, não só no total — os casos-âncora já documentados nos comentários de `constantes.ts` (idades 44–54, prazo 396 meses) servem de referência.
2. **Fase 4** (Caixa): generalizar `simularCaixaDuplo` (Pró-Cotista + MCMV + SBPE) em `programasEspeciais`, e extrair `tarifaAdministracaoMensal`.
3. **Aplicar a lição do incidente desta fase**: nas Fases 3 e 4, gravar o baseline como o primeiro passo, antes de qualquer ajuste no código legado que o TypeScript venha a exigir por causa da nova interceptação.
4. Depois da Fase 4, `simularBancoComTaxa` deve conter só o código de Caixa e Itaú puro (sem nenhum ramo morto de outros bancos) — bom momento para uma limpeza final e, possivelmente, renomear a função para refletir que ela é o caminho *legado*, não mais o caminho padrão.
