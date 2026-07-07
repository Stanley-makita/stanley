# Migração para o Motor Agnóstico — Fase 1 (concluída)

> Implementação da Fase 1 proposta em `docs/calibracao-simuladores/arquitetura-motor-agnostico.md`. Objetivo: criar a camada de critérios e migrar os bancos genéricos (Bradesco, Santander, Banco do Brasil) sem alterar nenhum resultado de simulação. Caixa, Itaú, Inter e Daycoval **não foram tocados**.

Data: 2026-07-06.

---

## Arquivos criados

| Arquivo | Conteúdo |
|---|---|
| `src/lib/simuladorFinanciamento/criteria.ts` | Tipo `SimulationCriteria` completo (conforme a proposta arquitetural) + tipos auxiliares (`EstrategiaSeguroMip`, `CriteriosDfi`, `CriteriosSeguro`, `CriteriosLtv`, `CriteriosComprometimentoRenda`, `CriteriosItbi`, `ProgramaEspecial`, `MetodoConversaoTaxa`) + `BancoSimOverrides` (relocado de `engine.ts`). |
| `src/lib/simuladorFinanciamento/criteria-resolver.ts` | `resolverCriterios(bancoId, overrides)` — monta um `SimulationCriteria` a partir de `BANCOS_CONFIG` + overrides do banco de dados. Escopo restrito a `BancoGenericoId = 'bradesco' \| 'santander' \| 'bb'` nesta fase. Exporta também `ehBancoGenerico()` (type guard) e `BANCOS_GENERICOS`. |
| `src/lib/simuladorFinanciamento/__tests__/criteria-migracao.test.ts` | 45 casos de regressão (15 cenários × 3 bancos) via `toMatchSnapshot()`, cobrindo SAC/PRICE, correntista, imóvel usado, LTV no limite e acima do limite, entrada igual ao valor do imóvel, idade jovem/próxima do limite/no corte de 80 anos, teto de imóvel do BB, renda baixa, e overrides de banco de dados (taxa/LTV/prazo/MIP/DFI, incluindo override só de MIP). |
| `docs/calibracao-simuladores/migracao-motor-agnostico-fase-1.md` | Este documento. |

## Arquivos alterados

| Arquivo | O que mudou |
|---|---|
| `src/lib/simuladorFinanciamento/constantes.ts` | Adicionada a constante `LIMITE_IDADE_PRAZO_MESES = 966` (movida de `engine.ts`) — necessário para que `criteria-resolver.ts` e `engine.ts` leiam o mesmo valor sem criar import circular entre os dois. Nenhum outro valor alterado. |
| `src/lib/simuladorFinanciamento/engine.ts` | (1) Removida a definição local de `LIMITE_IDADE_PRAZO_MESES` e de `BancoSimOverrides` — ambas agora reexportadas dos seus novos locais (`constantes.ts` e `criteria.ts` respectivamente), preservando 100% dos imports externos existentes. (2) `calcularPrazoMaximo` ganhou um terceiro parâmetro opcional `limiteIdadePrazoMeses`, com default igual à constante global de hoje — nenhum chamador existente (`motor-simulacao.ts`, o próprio `engine.ts`) precisou mudar. (3) Adicionadas as funções novas `resolverTaxaMip`, `taxaAnualParaMensalPorMetodo` e `simularComCriterios` (a nova função de cálculo agnóstica). (4) `simularBancoComTaxa` ganhou um único desvio no início: se o banco é genérico, delega inteiramente a `simularComCriterios` e retorna — nenhuma linha das ramificações `cfg.id === '...'` existentes foi alterada ou removida para os outros 4 bancos. |

Nenhum outro arquivo do sistema foi tocado (workflows, UI de configuração, banco de dados) — a Fase 1 é inteiramente interna ao motor de cálculo.

---

## O que foi migrado

| Banco | Antes | Depois |
|---|---|---|
| **Bradesco** | Calculado por `simularBancoComTaxa`, lendo `cfg.id === 'bradesco'`? não — caía direto no `else` genérico (`getMipRate`, `calcularSAC`/`calcularPRICE`, sem tarifa/ITBI) | Calculado por `simularComCriterios`, a partir de um `SimulationCriteria` montado por `resolverCriterios('bradesco', overrides)` — nenhuma leitura de `cfg.id` no caminho de cálculo |
| **Santander** | Idem Bradesco | Idem Bradesco, com `resolverCriterios('santander', overrides)` |
| **Banco do Brasil** | Idem Bradesco (inclusive o teto de imóvel de R$ 5.000.000, `cfg.maxValorImovel`) | Idem Bradesco, com `resolverCriterios('bb', overrides)` — teto de imóvel preservado via `criteria.maxValorImovel` |

**Não migrado nesta fase** (permanece exatamente como estava, sem nenhuma linha tocada):
- **Caixa** — função de cálculo própria (`calcularSACCaixa`/`calcularPRICECaixa`), tarifa de administração fixa, múltiplos programas (`simularCaixaDuplo`: Pró-Cotista + MCMV + SBPE).
- **Itaú** — função de cálculo própria (`calcularSACItau`/`calcularPRICEItau`), truncamento de taxa de 15 casas, MIP bifásico por período, DFI sobre valor de avaliação, ITBI incorporável.
- **Inter** — MIP por teto de idade (`INTER_MIP_SOMPO`) e DFI próprio (`INTER_DFI_RATE`), lidos via `cfg.id === 'inter'`.
- **Daycoval** — MIP flat (`DAYCOVAL_MIP_RATE`) e DFI próprio (`DAYCOVAL_DFI_RATE`), lidos via `cfg.id === 'daycoval'`.

Esses 4 bancos estão previstos para as Fases 2 (Inter/Daycoval), 3 (Itaú) e 4 (Caixa) do plano de migração original.

---

## Comprovação de que o resultado não mudou

**Método**: o arquivo de teste `criteria-migracao.test.ts` foi escrito e executado **antes** de qualquer alteração em `engine.ts`/`constantes.ts`, gravando 45 snapshots do resultado exato de `simularBanco()` para os 3 bancos genéricos numa bateria de cenários (ver lista de arquivos criados acima). Depois da refatoração completa, a mesma suíte foi executada de novo sem nenhuma alteração no arquivo de teste.

```
# Antes da refatoração (gera os snapshots)
$ npx vitest run src/lib/simuladorFinanciamento/__tests__/criteria-migracao.test.ts
 Snapshots  45 written
 Tests  45 passed (45)

# Depois da refatoração completa (compara contra os snapshots gravados)
$ npx vitest run src/lib/simuladorFinanciamento/__tests__/criteria-migracao.test.ts
 Tests  45 passed (45)
```

Na segunda execução, o vitest **compara** o resultado novo contra o snapshot gravado e falha se houver qualquer diferença byte a byte (incluindo diferenças de arredondamento de ponto flutuante). Os 45 testes passaram sem nenhuma atualização de snapshot necessária — ou seja, `primeiraParcela`, `ultimaParcela`, `totalJuros`, `totalSeguros`, `totalPago`, `taxaMensal`, `maxFinanciavel30`, `elegivel` e `motivoInelegivel` são **idênticos** antes e depois, para os 3 bancos, nos 15 cenários testados (incluindo casos de borda: LTV exatamente no limite, entrada igual ao valor do imóvel, idade no corte duro de 80 anos, teto de imóvel do BB, e overrides de banco de dados — inclusive o caso de override só de `mipRate`, que precisa virar taxa flat e ignorar a tabela por idade).

**Suíte completa do simulador** (`amortizacao.test.ts`, que já cobria Bradesco/Santander/BB em cenários de SAC/PRICE, mais os demais arquivos de teste do projeto):

```
$ npx vitest run
 Test Files  5 passed (5)
      Tests  86 passed (86)
```

**Typecheck**:

```
$ npx tsc --noEmit -p tsconfig.json
(sem erros)
```

---

## Diff — só o essencial

O diff de `engine.ts` é puramente aditivo, exceto por 2 pontos:
1. Relocação de `LIMITE_IDADE_PRAZO_MESES` e `BancoSimOverrides` para novos arquivos, com reexport preservando 100% dos imports externos (verificado via busca em todo o repositório antes da mudança — só `motor-simulacao.ts` importava a constante, e `workflow-consulta.ts`/`workflow-captacao.ts`/`motor-simulacao.ts`/`SimuladorFinanciamento.tsx` importavam o tipo).
2. Um parâmetro opcional novo em `calcularPrazoMaximo`, com default idêntico ao comportamento anterior.

Nenhuma linha das funções `calcularSACItau`, `calcularPRICEItau`, `calcularSACCaixa`, `calcularPRICECaixa`, `getItauMipRate`, `getCaixaMipRate`, `getInterMipRate`, `simularCaixaDuplo`, `simularTodosBancos` ou `calcularAnalise` foi alterada.

---

## Riscos restantes

1. **Duplicação temporária de lógica.** `simularComCriterios` replica a estrutura de `simularBancoComTaxa` (mesma ordem de checagens de elegibilidade, mesmas mensagens de erro) em vez de compartilhar código com ela. Isso é intencional nesta fase — o objetivo era provar que o caminho novo produz resultado idêntico antes de tocar no caminho antigo — mas significa que, até a Fase 4 (quando `simularBancoComTaxa` for removida ou reduzida a só bancos legados), **uma correção de bug na lógica de elegibilidade genérica precisaria ser replicada nos dois lugares** se alguém mexer no código antigo sem saber da existência do novo caminho. Mitigação: este documento e os comentários em `engine.ts` deixam essa duplicação explícita.
2. **`resolverTaxaMip` e `taxaAnualParaMensalPorMetodo` lançam erro em vez de calcular** para as estratégias/métodos que pertencem aos bancos ainda não migrados (`teto-idade`, `periodo-e-idade`, `composta-truncada-15-casas`). Isso é seguro **hoje** porque `resolverCriterios` nunca produz esses valores para Bradesco/Santander/BB — mas se alguém, no futuro, chamar `simularComCriterios` diretamente com um critério mal formado (fora do fluxo normal via `resolverCriterios`), o erro só aparece em runtime, não em tempo de compilação. Isso é aceitável para uma fase de transição, mas deve ser revisitado quando os outros bancos migrarem (a União discriminada do TypeScript garante exaustividade de tipo, mas não impede alguém de construir um objeto `SimulationCriteria` inválido manualmente).
3. **`BancoGenericoId` é uma lista hardcoded de 3 strings** (`'bradesco' | 'santander' | 'bb'`) em `criteria-resolver.ts`. Se um desses 3 bancos ganhar uma especialização própria no futuro (ex.: Bradesco habilitar PRICE, conforme identificado em `plano-calibracao.md`), ele deixa de ser "genérico" no sentido estrito e provavelmente precisará de ajustes em `resolverCriterios` (não em `engine.ts`, que é exatamente o ganho arquitetural pretendido) — mas a lista `BANCOS_GENERICOS` precisará ser reavaliada nesse momento, não é permanente.
4. **Nenhum dado de calibração mudou.** Esta fase é estrutural por definição — ela não resolve nenhum item de `plano-calibracao.md` (ex.: taxa do Inter, PRICE do Bradesco/BB). Isso é esperado e intencional, mas vale reforçar para não gerar expectativa equivocada de que a refatoração "corrigiu" alguma regra.

---

## Próximos passos

1. **Fase 2** (Inter, Daycoval): migrar para `resolverCriterios`, introduzindo de fato as estratégias `'teto-idade'` (Inter) e `'flat'` já suportado (Daycoval — este já reaproveita o mesmo caso usado pelo override de MIP dos bancos genéricos). Baixo risco, sem função de cálculo duplicada nestes dois bancos hoje.
2. **Fase 3** (Itaú): extrair `prePagamentoNoMesZero: true`, `incluirNaUltimaParcela: false`, `metodoConversaoTaxa: 'composta-truncada-15-casas'`, `seguro.dfi.base: 'valor-avaliacao'`, `itbi.permiteIncorporar: true` e a estratégia `'periodo-e-idade'` do MIP. Exige validação mês a mês (não só total) contra os casos-âncora já documentados nos comentários de `constantes.ts`, por ser o banco com a lógica de cálculo mais diferente da genérica.
3. **Fase 4** (Caixa): generalizar `simularCaixaDuplo` em `programasEspeciais` dentro do critério da Caixa, e extrair `tarifaAdministracaoMensal`. É a fase mais estrutural, pois hoje é a única com múltiplos resultados por banco.
4. Só depois da Fase 4, `simularBancoComTaxa` pode ser reduzida a atender apenas bancos migrados posteriormente ou removida por completo, eliminando a duplicação apontada no risco 1.
5. Seguir usando `criteria-migracao.test.ts` como modelo: para cada fase seguinte, gravar snapshot do banco-alvo *antes* de tocar em `engine.ts`, e só considerar a fase concluída quando os snapshots baterem sem alteração (ou, no caso de correção deliberada de regra vinda de `plano-calibracao.md`, quando a mudança de snapshot for explicitamente justificada no documento da fase correspondente).
