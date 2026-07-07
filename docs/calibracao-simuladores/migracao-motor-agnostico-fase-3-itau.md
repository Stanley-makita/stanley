# Migração para o Motor Agnóstico — Fase 3: Itaú (concluída)

> Implementação da Fase 3 proposta em `docs/calibracao-simuladores/arquitetura-motor-agnostico.md`. Objetivo: migrar o Itaú para `SimulationCriteria` sem alterar o comportamento final, e avaliar separadamente se a correção de MIP para idades 18–43 (identificada em `docs/calibracao-simuladores/casos-ancora.md`) é segura o suficiente para aplicar agora. Caixa não foi tocada.

Data: 2026-07-06.

---

## Arquivos alterados

| Arquivo | O que mudou |
|---|---|
| `src/lib/simuladorFinanciamento/criteria.ts` | Adicionado `PeriodoMip` (tipo nomeado, extraído da variante `periodo-e-idade` de `EstrategiaSeguroMip` para reuso em `engine.ts`) e o campo opcional `mipParaCapacidadeMaxima?: EstrategiaSeguroMip` em `SimulationCriteria` — necessário porque o Itaú, desde antes desta migração, usa a tabela **genérica** de mercado (`MIP_RATES`) só para a estimativa de capacidade máxima de financiamento, não a sua própria tabela período+idade. |
| `src/lib/simuladorFinanciamento/criteria-resolver.ts` | `resolverCriterios` ampliado para aceitar `BancoComCriteriosId = ... \| 'itau'`. Nova função `estrategiaMipItau()` traduzindo `ITAU_MIP_P1`/`ITAU_MIP_P2` para o formato genérico `periodo-e-idade` (dois períodos: 0–120 meses e 121+). O corpo de `resolverCriterios` ganhou lógica específica para `seguro.dfi.base` ('valor-avaliacao' só para o Itaú), `itbi`, `metodoConversaoTaxa` ('composta-truncada-15-casas' só para o Itaú) e `mipParaCapacidadeMaxima`. **Importante**: replica fielmente uma limitação pré-existente — os overrides de banco de dados `mipRate`/`dfiRate` nunca chegavam à função de cálculo real do Itaú (só `mipRate` afetava a estimativa de capacidade máxima); isso foi preservado exatamente, não corrigido (ver seção de riscos). |
| `src/lib/simuladorFinanciamento/engine.ts` | (1) `taxaAnualParaMensalItau` renomeada para `taxaAnualParaMensalTruncada15Casas` (mesma implementação, nome agnóstico). (2) `getItauMipRate` generalizada em `resolverTaxaMipPorPeriodo(periodos, ageFloor, month)` — recebe as tabelas como parâmetro em vez de importar `ITAU_MIP_P1`/`ITAU_MIP_P2` diretamente; fallback final replicado literalmente (cai sempre na idade mínima do **primeiro** período, não do período pesquisado — um comportamento peculiar do código original, preservado de propósito). (3) `calcularSACItau`/`calcularPRICEItau` generalizadas em `calcularSACPeriodoIdade`/`calcularPRICEPeriodoIdade` — mesma lógica exata (pré-pagamento no mês 0, MIP/DFI zerados na última parcela, DFI truncado em 2 casas), agora recebendo `periodosMip`/`dfiTaxaMensal` como parâmetros. (4) `resolverTaxaMip` (dispatcher genérico de MIP "resolvível de uma vez") passou a documentar explicitamente por que `'periodo-e-idade'` não se resolve ali (varia mês a mês). (5) `simularComCriterios` ganhou o dispatch `criteria.seguro.mip.tipo === 'periodo-e-idade'` → chama as funções especializadas, resolve ITBI (`criteria.itbi`), valor de avaliação (`criteria.seguro.dfi.base`) e usa `criteria.mipParaCapacidadeMaxima` para a estimativa. (6) Removidos os ramos `cfg.id === 'itau'` (agora inalcançáveis) de `simularBancoComTaxa` — só a Caixa chega mais a essa função. (7) Imports órfãos (`ITAU_MIP_P1`, `ITAU_MIP_P2`, `ITAU_DFI_RATE`) removidos do topo do arquivo (usados agora só em `criteria-resolver.ts`). |
| `src/lib/simuladorFinanciamento/constantes.ts` | **Correção de dado** (não estrutural): `ITAU_MIP_P1`, idades 18–43, substituídas pelos valores reais extraídos de `VALIDADE!AH11:AI36` no `simulador itau.xlsm` — ver seção dedicada abaixo. Idades 44+ não foram tocadas. |
| `src/lib/simuladorFinanciamento/__tests__/criteria-migracao-fase3-itau.test.ts` | **Novo.** 21 testes: 19 cenários de regressão via `toMatchSnapshot()` + 2 validando o caso-âncora real (Henrique Justo Mengue) diretamente por valor (`toBeCloseTo`) e por snapshot completo. |
| `docs/calibracao-simuladores/migracao-motor-agnostico-fase-3-itau.md` | Este documento. |

---

## Banco migrado

**Itaú** — antes calculado por `simularBancoComTaxa` com 4 ramos `cfg.id === 'itau'` (truncamento de taxa, ITBI, DFI sobre avaliação, dispatch para `calcularSACItau`/`calcularPRICEItau`). Agora calculado por `simularComCriterios`, a partir de `resolverCriterios('itau', overrides)` — nenhuma leitura de `cfg.id` no caminho de cálculo.

Diferente das Fases 1 e 2, o Itaú **exigiu generalizar as funções de cálculo em vez de só trocar a fonte do dado de seguro** — é o primeiro banco migrado que tinha comportamento matemático genuinamente diferente da fórmula genérica (pré-pagamento no mês 0, seguros zerados na última parcela, DFI sobre avaliação, MIP variável mês a mês por período do contrato, ITBI incorporável, taxa truncada). A generalização foi feita **sem reescrever a lógica** — as funções `calcularSACItau`/`calcularPRICEItau`/`getItauMipRate`/`taxaAnualParaMensalItau` foram renomeadas e passaram a receber como parâmetro o que antes importavam diretamente de `constantes.ts`. O corpo matemático de cada função não mudou uma linha.

**Não migrado nesta fase**: Caixa — única com função de cálculo própria e múltiplos programas por banco (Pró-Cotista + MCMV + SBPE), prevista para a Fase 4.

---

## Prova de equivalência (antes da correção de MIP)

Mesma metodologia das Fases 1–2, agora com um cuidado extra aprendido no incidente da Fase 2: a suíte de baseline foi escrita e executada **antes** de qualquer alteração em `engine.ts`/`constantes.ts`.

```
# Antes da migração (gera os snapshots)
$ npx vitest run src/lib/simuladorFinanciamento/__tests__/criteria-migracao-fase3-itau.test.ts
 Snapshots  20 written
 Tests  21 passed (21)
```

Na primeira tentativa de reativar a migração, **2 dos 21 testes falharam** (overrides de `mipRate` e `dfiRate`) — não por um bug de generalização, mas porque a migração expôs uma **limitação pré-existente do código original**: `calcularSACItau`/`calcularPRICEItau` nunca liam os overrides do banco de dados (calculavam MIP/DFI inteiramente a partir das constantes do Itaú, ignorando `overrides.mipRate`/`overrides.dfiRate`), enquanto minha primeira versão do `criteria-resolver.ts` deixava esses overrides "vazarem" para dentro do critério do Itaú, mudando o resultado. Corrigido fazendo `resolverCriterios` ignorar esses dois overrides especificamente para o Itaú na composição de `seguro.mip`/`seguro.dfi` (preservando o comportamento original, não corrigindo-o — ver seção de riscos).

```
# Depois da correção da precedência de overrides — migração completa e ativa
$ npx tsc --noEmit -p tsconfig.json
(sem erros)

$ npx vitest run src/lib/simuladorFinanciamento/__tests__/criteria-migracao-fase3-itau.test.ts
 Tests  21 passed (21)

$ npx vitest run     # suíte completa do projeto
 Test Files  7 passed (7)
      Tests  130 passed (130)
```

### Validação mês a mês contra o caso-âncora real

O arquivo de teste reconstrói o cliente real documentado em `docs/calibracao-simuladores/casos-ancora/itau-casos.json` (id `itau-henrique-mengue-001`, extraído do `simulador itau.xlsm`): saldo financiado R$ 1.054.500, avaliação R$ 1.495.000, prazo 396 meses, taxa 13% a.a., nascimento 29/12/1980, contrato em 28/08/2025 (idade 44 na contratação). Rodando pelo motor migrado:

| Campo | Valor real (planilha) | Valor calculado (Fonti, pós-migração) | Diferença |
|---|---|---|---|
| 1ª parcela | R$ 14.430,81 | R$ 14.430,807... | < R$ 0,01 |
| Última parcela | R$ 2.690,14 | R$ 2.690,138... | < R$ 0,01 |
| Valor financiado | R$ 1.054.500 | R$ 1.054.500 | exato |
| Prazo | 396 meses | 396 meses | exato |

A 1ª parcela (mês 1, idade 44, inclui pré-pagamento do mês 0) e a última parcela (mês 396, seguros zerados) dependem de trechos diferentes e distantes da tabela de amortização — baterem as duas ao centavo é uma validação forte de que a generalização preservou o comportamento mês a mês, não só o resultado agregado. Este caso ficou registrado permanentemente como teste automatizado (`describe('Itaú — caso-âncora real ...')`).

---

## Correção de MIP para idades 18–43 (etapa separada, aplicada)

### Por que foi considerada seções segura

`docs/calibracao-simuladores/casos-ancora.md` (seção 10) já recomendava esta correção como candidata de baixo risco. Antes de aplicar, verifiquei que não se tratava de um único ponto de dado (o que teria sido arriscado demais para uma correção "direta e segura") — extraí a **tabela completa e real** de `VALIDADE!AH11:AI36` no `simulador itau.xlsm` (a mesma aba "Tabela MIP", seguradora "ATUAL"/"Seguradora Itaú" usada pelo caso-âncora real):

| Idade | Valor antigo (estimado) | Valor novo (real, planilha) |
|---|---|---|
| 18–30 | 0,0000900–0,0001950 (progressão linear assumida) | 0,0001031 (constante — a planilha real NÃO varia entre 18 e 30 anos) |
| 31–35 | 0,0002080–0,0002700 | 0,0001581–0,0001746 |
| 36–43 | 0,0002840–0,0003740 | 0,0002477–0,0003486 |
| 44 (fronteira) | 0,0003829 (já real, não mudou) | 0,0003829 (idêntico — confirma que é a mesma tabela) |

A idade 44 bater exatamente entre as duas fontes (planilha nova vs. valor já calibrado antes desta correção) foi o critério decisivo de segurança — é uma prova cruzada de que a tabela extraída agora é a mesma fonte viva que já alimentava o código, não uma tabela diferente por engano.

**Observação preservada fielmente**: a tabela real tem um pequeno "mergulho" não-monotônico na idade 42 (0,0003185, menor que a idade 41 em 0,0003198). Isso poderia parecer um erro de transcrição, mas é o valor real da planilha oficial — não foi suavizado ou corrigido, pois o objetivo é fidelidade ao dado real do banco, não uma curva esteticamente perfeita.

**O que NÃO foi tocado**: as idades 44+ (já tinham extração direta e precisa do simulador, com mais casas decimais que a tabela `VALIDADE` — que arredonda em 7 casas — então não fazia sentido substituir um dado mais preciso por um menos preciso só para "unificar a fonte") e a tabela `ITAU_MIP_P2` (período pós-renovação decenal) — essa tabela hoje só tem entradas a partir da idade 54; não há dado real disponível para as idades 18–43 no período 2, então nada foi alterado ali (ver riscos).

### Impacto observado (exemplos)

| Cenário | 1ª parcela antes | 1ª parcela depois | Diferença |
|---|---|---|---|
| Cliente de ~36 anos, financiado R$ 350.000, 420 meses, SAC | R$ 4.382,31 | R$ 4.356,90 | **−R$ 25,41 (−0,58%)** |
| Cliente de 25 anos, mesmo cenário | R$ 4.278,01 (verificado revertendo temporariamente o valor da idade 25 e comparando) | R$ 4.255,68 | **−R$ 22,33 (−0,52%)** |

Em ambos os casos a correção **reduz** a parcela estimada (a tabela real é mais barata que a progressão estimada assumia nessas faixas) — ou seja, o motor estava cobrando um MIP um pouco mais caro que o real para clientes jovens do Itaú antes desta correção.

### Prova de equivalência da correção (snapshots atualizados deliberadamente)

```
$ npx vitest run src/lib/simuladorFinanciamento/__tests__/criteria-migracao-fase3-itau.test.ts
 15 failed | 6 passed (21)   # ← esperado: só cenários com idade 18-43 durante o contrato mudam
```

Os 15 testes que mudaram são exatamente os que usam idade entre 18 e 43 em algum momento do contrato (cenário base ~36 anos, "idade jovem 25 anos", ITBI, valorAvaliacao, overrides, prazo longo cruzando P1→P2, etc.). Os 6 que **não** mudaram confirmam a delimitação exata da correção:
- `idade 44 anos` (fronteira, tabela idêntica antes/depois)
- `idade próxima ao limite (78 anos)` e `idade no corte duro de 80 anos` (fora da faixa 18-43)
- `LTV acima do limite` (bloqueado antes de qualquer cálculo de seguro)
- as 2 validações do caso-âncora real (idade 44 na contratação — não afetado)

Snapshots atualizados com `vitest -u` e revisados um a um (ver tabela de impacto acima). Depois da atualização:

```
$ npx tsc --noEmit -p tsconfig.json
(sem erros)

$ npx vitest run
 Test Files  7 passed (7)
      Tests  130 passed (130)
```

---

## Riscos restantes

Os riscos já registrados nas Fases 1–2 (duplicação temporária de lógica entre `simularComCriterios` e `simularBancoComTaxa` — agora só relevante para a Caixa; necessidade de reavaliar a lista de bancos migrados se algum ganhar nova especialização) continuam válidos. Específicos desta fase:

1. **Overrides de `mipRate`/`dfiRate` continuam sem efeito real no Itaú.** Isso já era verdade antes desta migração — preservei o comportamento de propósito, não corrigi. Um analista que tentar calibrar o MIP ou o DFI do Itaú pela tela Configurações > Bancos vai editar um campo que, hoje, só afeta a estimativa de capacidade máxima (`mipRate`) ou nada (`dfiRate`). Vale um alerta de UX futuro, ou uma decisão explícita de habilitar esses overrides de verdade (mudança de comportamento, fora do escopo desta fase).
2. **`ITAU_MIP_P2` não tem entradas para idades 18–53.** Um cliente jovem cujo contrato ultrapasse o mês 121 (10 anos) cai no fallback (idade mínima do período 1, hoje 0,0001031) em vez de um valor real do período 2 para a idade dele — esse é um comportamento pré-existente (não introduzido nem corrigido nesta fase) que fica mais visível agora que o período 1 está mais preciso. Recomenda-se extrair a tabela `VALIDADE` equivalente do período 2 (provavelmente numa aba renomeada ou uma segunda tabela na mesma planilha, não localizada nesta rodada) numa calibração futura.
3. **Precisão mista entre as duas fontes dentro do mesmo `ITAU_MIP_P1`.** Idades 18–43 agora vêm de uma tabela arredondada em 7 casas decimais (`VALIDADE!AH:AI`); idades 44+ vêm de uma extração mais precisa (`CALCULOS!U`, até 10 casas). Isso não causa nenhum problema de cálculo (ambas são "reais", só com precisões diferentes), mas gera uma pequena descontinuidade estilística na tabela que vale documentar para quem for mexer nela de novo — não recomendo tentar "igualar a precisão" sem uma nova extração de `CALCULOS!U` para as idades 18–43 especificamente.
4. **`resolverTaxaMipPorPeriodo` tem uma trap defensiva não testada diretamente**: se `periodos` vier vazio (nunca acontece via `resolverCriterios`, que sempre monta os 2 períodos do Itaú), `periodos.find(...) ?? periodos[0]` retorna `undefined`, e a função quebra ao acessar `periodo.tabelaPorIdade`. Não é um risco prático hoje (só o Itaú usa essa função, sempre com 2 períodos), mas fica registrado para quando outro banco eventualmente usar `periodo-e-idade`.

---

## Próximos passos

1. **Fase 4** (Caixa): generalizar `simularCaixaDuplo` (Pró-Cotista + MCMV + SBPE) em `programasEspeciais`, extrair `tarifaAdministracaoMensal`. É a última fase da migração estrutural — depois dela, `simularBancoComTaxa` deveria conter só código morto (nenhum banco chega mais lá) e pode ser removida ou drasticamente reduzida.
2. **Calibração futura, fora do escopo desta migração**: obter a tabela `ITAU_MIP_P2` para idades abaixo de 54 (risco 2 acima), decidir se os overrides de MIP/DFI do Itaú devem passar a ter efeito real (risco 1), e resolver o conflito de LTV do Itaú (80% vs 90%, já identificado em `plano-calibracao.md`).
3. Manter o padrão desta fase para a Fase 4: capturar baseline **antes** de qualquer alteração de código, e só depois lidar com os ajustes que o TypeScript exigir no caminho legado por causa da nova interceptação — a ordem inversa foi a causa do incidente na Fase 2.
