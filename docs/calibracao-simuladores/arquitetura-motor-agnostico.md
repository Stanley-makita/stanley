# Proposta: Motor de Simulação Agnóstico a Banco

> Continuação de `mapa-parametros-engine.md` e `plano-calibracao.md`. Aqui a pergunta muda de "quais valores estão certos" para "como o código deveria estar estruturado para que calibrar um banco nunca mais exija tocar em `engine.ts`". **Este documento é só proposta técnica e plano de migração — nenhum código foi alterado.**

Data: 2026-07-06.

---

## 1. Objetivo

Hoje, `engine.ts` decide **o quê** calcular e **como** calcular ao mesmo tempo, e faz isso perguntando `cfg.id === 'itau'`, `cfg.id === 'caixa'`, `cfg.id === 'inter'` etc. em pelo menos 9 pontos diferentes. Isso significa que:

- Calibrar um banco novo (ex.: habilitar PRICE no Bradesco, ou Pró-Cotista no Inter/BB — ambos já identificados como prontos em `plano-calibracao.md`) exige editar `engine.ts`, não só configuração.
- Um comportamento específico de um banco (ex.: o pré-pagamento de seguros no mês 0 do Itaú) está enterrado dentro de uma função de cálculo inteira duplicada (`calcularSACItau`), em vez de ser uma variação parametrizada da função genérica.
- Não há uma "fonte única da verdade" dos parâmetros de um banco — eles estão espalhados entre `BancoConfig` (constantes.ts), overrides do banco de dados (`BancoSimOverrides`), e comportamento implícito no corpo das funções de cálculo (que nenhum override alcança).

**Meta arquitetural**: `engine.ts` deve saber calcular SAC e PRICE dado um conjunto de critérios — e nada mais. Toda regra "este banco faz X diferente" deve virar um campo em `SimulationCriteria`, nunca um `if (cfg.id === ...)`.

---

## 2. Diagnóstico — todo acoplamento a banco específico encontrado em `engine.ts`

| # | Local (função/linha aproximada) | O que está hardcoded a um banco | Por quê é um problema |
|---|---|---|---|
| 1 | `taxaAnualParaMensalItau` (linha 21) + o `if (cfg.id === 'itau' ...)` que a chama (linha 423) | Itaú usa truncamento de 15 casas decimais na conversão taxa anual→mensal; todos os outros usam a fórmula padrão | É uma variação de **método de arredondamento**, não uma exclusividade do Itaú — outro banco pode ter o mesmo comportamento e não há como declarar isso sem duplicar a função |
| 2 | `getItauMipRate` + `ITAU_MIP_P1`/`ITAU_MIP_P2` (linhas 26–34, 189–228) | MIP do Itaú varia por **dois períodos** (0–120 meses / 121+) com tabela própria por idade inteira | É uma **estratégia de MIP** (tabela bifásica por idade), diferente das estratégias "tabela simples por faixa" (genérica), "tabela por teto de idade" (Caixa/Inter) e "flat" (Daycoval) — hoje são 4 implementações incompatíveis, uma por banco, sem uma interface comum |
| 3 | `calcularSACItau` / `calcularPRICEItau` (linhas 55–143) | Função de cálculo inteira duplicada só para o Itaú: pré-pagamento de seguros no "mês 0", MIP e DFI zerados na última parcela, DFI sobre valor de **avaliação** (não de imóvel) | Qualquer ajuste na fórmula genérica de SAC/PRICE (ex.: um bug fix) precisa ser replicado manualmente aqui — já são 2 implementações da mesma lógica de amortização |
| 4 | `calcularSACCaixa` / `calcularPRICECaixa` (linhas 268–336) | Outra função de cálculo inteira duplicada só para a Caixa: soma `CAIXA_TA_MENSAL` fixo, zera MIP/DFI na última parcela (mesmo comportamento do Itaú, reimplementado à parte) | Mesma dívida técnica do item 3 — agora são **3** implementações de SAC e **3** de PRICE fazendo a mesma coisa com pequenas variações |
| 5 | `getCaixaMipRate` / `getInterMipRate` (linhas 252–264) | Duas funções idênticas (mesmo algoritmo: busca por teto de idade), uma para cada tabela (`CAIXA_MIP_RATES`, `INTER_MIP_SOMPO`) | Deveria ser uma função genérica parametrizada pela tabela, não duas cópias |
| 6 | `LIMITE_IDADE_PRAZO_MESES` (linha 164), usado por `calcularPrazoMaximo` para **todos** os bancos igualmente | Regra "idade + prazo ≤ 80 anos e 6 meses" aplicada de forma uniforme | `plano-calibracao.md` já mostra que essa regra só tem confirmação oficial para Itaú e BB (FGTS) — Santander/Bradesco/Inter herdam por suposição. O código não tem como declarar um valor diferente por banco |
| 7 | `simularBancoComTaxa` — checagem `if (idadeAnos >= 80)` (linha 400) | Corte duro de idade, independente do cálculo de idade+prazo, aplicado a todos os bancos | Regra redundante com o item 6, sem fonte identificada nem no código nem na biblioteca técnica, e sem possibilidade de variar por banco |
| 8 | `simularBancoComTaxa` — `(cfg.id === 'caixa' && input.tipoImovel === 'usado') ? baseLtv - 0.10 : baseLtv` (linha 392) | Penalidade de LTV para imóvel usado, exclusiva da Caixa | Deveria ser um parâmetro (`penalidadeLtvImovelUsado`) que qualquer banco poderia ter, hoje só existe se `cfg.id === 'caixa'` |
| 9 | `simularBancoComTaxa` — MIP dispatch (linhas 375–380) | `cfg.id === 'caixa' ? ... : cfg.id === 'inter' ? ... : cfg.id === 'daycoval' ? ... : getMipRate(...)` | Ponto central de acoplamento — a escolha de **qual estratégia de seguro usar** está codificada como uma cadeia de `if` por banco, em vez de ler um campo de critério |
| 10 | `simularBancoComTaxa` — DFI dispatch (linhas 381–384) | Mesma estrutura do item 9, para DFI | Mesmo problema |
| 11 | `simularBancoComTaxa` — `if (input.tipoAmortizacao === 'PRICE' && !cfg.suportaPrice)` (linha 396) | Elegibilidade de PRICE controlada por um booleano fixo em `constantes.ts`, sem override possível hoje | `plano-calibracao.md` mostra que esse booleano está **errado** para Bradesco e BB (ambos suportam PRICE na realidade) — não há como corrigir isso sem editar código, porque não existe caminho de configuração para `suportaPrice` |
| 12 | `simularBancoComTaxa` — dispatch de função de cálculo (linhas 439–449) | `cfg.id === 'itau' ? ... : cfg.id === 'caixa' ? ... : ...` decide **qual das 3 famílias de função de cálculo** rodar | Consequência direta dos itens 3 e 4 — o motor "sabe" que existem bancos especiais por nome |
| 13 | `simularBancoComTaxa` — `cfg.id === 'itau' && input.incorporarItbi` (linha 429) | Incorporação de ITBI ao financiamento só existe para o Itaú | A biblioteca confirma a regra só para o Itaú, mas isso é uma limitação de pesquisa, não necessariamente uma exclusividade real do produto — hoje o código não permite testar a hipótese em outro banco mesmo que se descubra que ele também oferece |
| 14 | `simularBancoComTaxa` — comprometimento de renda (linha 454) | `(input.tipoAmortizacao === 'PRICE' && cfg.comprometimentoMaxPrice) ? cfg.comprometimentoMaxPrice : 0.30` — só a Caixa tem `comprometimentoMaxPrice` definido | Bradesco tem 15% confirmado oficialmente para PRICE e não há campo para declarar isso sem ser Caixa |
| 15 | `simularBanco` (linhas 466–493) | Lógica inline de Pró-Cotista/MCMV **só quando `bancoId === 'caixa'`** | Mistura resolução de programa (dado de produto) com execução de cálculo (responsabilidade do engine) — e impede que BB/Inter tenham seus próprios Pró-Cotista sem duplicar essa lógica |
| 16 | `simularCaixaDuplo` (linhas 496–527) | Função inteira que só existe porque a Caixa retorna múltiplas linhas de resultado (Pró-Cotista + MCMV + SBPE) | Estruturalmente, "um banco pode ter mais de um programa elegível ao mesmo tempo" é uma regra de **produto**, não deveria exigir uma função de execução dedicada por banco |
| 17 | `simularTodosBancos` — `if (id !== 'caixa' && (op === 'lote_urbanizado' \|\| ...))` e `if (id !== 'caixa' && op === 'comercial')` (linhas 629, 637) | Restrição de modalidade (lote/construção/comercial só a Caixa opera) hardcoded por `bancoId` | `plano-calibracao.md` mostra que Itaú, Bradesco e BB têm produtos próprios de terreno/construção/comercial na realidade — hoje ampliar a cobertura para outro banco exige mexer nesse `if` |
| 18 | `simularTodosBancos` — `if (id === 'caixa') { ...simularCaixaDuplo... } else { ...simularBanco... }` (linhas 645–648) | Dispatch final, consequência direta do item 16 | Mesmo problema — o "banco especial" está no controle de fluxo do motor |

**Resumo do diagnóstico**: existem **3 famílias de função de cálculo** (genérica, Itaú, Caixa) fazendo a mesma matemática de amortização com pequenas variações, **4 estratégias de seguro** implementadas separadamente sem interface comum, e **9 pontos de `cfg.id === '...'`** dentro do fluxo principal. Nenhum desses pontos precisa saber o *nome* do banco — cada um precisa apenas de um *valor* ou *comportamento* que hoje está implícito no código em vez de declarado em dado.

---

## 3. Proposta — `SimulationCriteria`

Uma única interface que descreve **tudo que uma simulação de SAC/PRICE precisa saber**, sem nenhuma referência a "qual banco é". `engine.ts` passa a ter uma única porta de entrada de dado: `SimulationCriteria` + o `InputFinanciamento` do cliente (valor do imóvel, entrada, renda, data de nascimento etc. — isso já é agnóstico hoje e não muda).

```ts
// src/lib/simuladorFinanciamento/criteria.ts (novo arquivo)

export type MetodoConversaoTaxa = 'composta-padrao' | 'composta-truncada-15-casas'

export type EstrategiaSeguro =
  | { tipo: 'faixa-etaria';      faixas: Array<{ idadeMin: number; idadeMax: number; taxa: number }> }
  | { tipo: 'teto-idade';        faixas: Array<{ tetoIdade: number; taxa: number }> }
  | { tipo: 'flat';              taxa: number }
  | { tipo: 'periodo-e-idade';   periodos: Array<{ mesInicio: number; mesFimExclusive: number | null; tabelaPorIdade: Record<number, number> }> }

export interface CriteriosSeguro {
  mip: EstrategiaSeguro          // sempre sobre saldo devedor
  dfi: { base: 'valor-imovel' | 'valor-avaliacao'; taxaMensal: number }
  incluirNaUltimaParcela: boolean  // false = Itaú e Caixa hoje; default true
  prePagamentoNoMesZero: boolean  // true = só Itaú hoje; default false
}

export interface CriteriosLtv {
  sac: number
  price?: number                  // se ausente, PRICE não é suportado (ver amortizacoesSuportadas)
  correntista?: number            // se ausente, usa o mesmo valor de sac/price
  penalidadeImovelUsado?: number  // ex.: 0.10 → subtrai 10pp do LTV para imóvel usado
}

export interface CriteriosComprometimentoRenda {
  sac: number                     // ex.: 0.30
  price?: number                  // ex.: 0.25 (Caixa) ou 0.15 (Bradesco)
}

export interface CriteriosItbi {
  permiteIncorporar: boolean
  percentualPadrao: number        // ex.: 0.05
}

export interface ProgramaEspecial {
  id: string                      // ex.: 'caixa-procotista', 'bb-procotista', 'caixa-mcmv-faixa-1'
  nome: string                    // label exibido, ex.: 'Pró-Cotista FGTS'
  elegivel: (input: InputFinanciamento) => boolean   // ex.: valorImovel <= teto && usaFgts
  taxaAnual: number
  mipOverride?: EstrategiaSeguro  // programas subsidiados têm MIP próprio (ex.: MCMV)
}

export interface SimulationCriteria {
  bancoId: BancoId
  programa: string                 // 'SBPE' (default) — trocado dinamicamente se um ProgramaEspecial for aplicado
  taxaAnualBase: number
  taxaAnualCorrentista: number
  amortizacoesSuportadas: Array<'SAC' | 'PRICE'>
  ltv: CriteriosLtv
  prazoMaximoMeses: number
  limiteIdadePrazoMeses: number     // ex.: 966 (80a6m) — agora por banco, não mais global
  idadeMaximaAbsoluta?: number      // corte duro independente, se existir de fato (hoje sem fonte confirmada — ver seção 6)
  comprometimentoRenda: CriteriosComprometimentoRenda
  maxValorImovel: number            // 0 = sem limite
  seguro: CriteriosSeguro
  tarifaAdministracaoMensal: number // 0 = sem tarifa
  itbi?: CriteriosItbi
  metodoConversaoTaxa: MetodoConversaoTaxa
  modalidadesSuportadas: TipoOperacao[]   // substitui o hardcode "só a Caixa opera lote/construção/comercial"
  programasEspeciais?: ProgramaEspecial[] // Pró-Cotista, MCMV etc. — qualquer banco pode ter, não só Caixa
}
```

Este objeto é o que `engine.ts` consome — e é **tudo** que ele consome. Nada de `BancoConfig`, nada de `cfg.id`.

---

## 4. Onde vive a resolução de critérios (fora do engine)

`SimulationCriteria` não substitui `BancoConfig`/`BancoSimOverrides` como *fonte* de dado — substitui como *contrato de consumo*. A responsabilidade de "montar" um `SimulationCriteria` a partir de configuração base + overrides do banco de dados passa a ser de uma função pura, fora do motor de cálculo:

```ts
// src/lib/simuladorFinanciamento/criteria-resolver.ts (novo arquivo)

export function resolverCriterios(
  bancoId: BancoId,
  overrides: BancoSimOverrides | undefined,
  input: InputFinanciamento,
): SimulationCriteria[] {
  // 1. Monta o critério "base" do banco (equivalente ao BancoConfig de hoje + overrides do DB)
  // 2. Resolve programasEspeciais elegíveis para o input (ex.: Pró-Cotista, MCMV) —
  //    isso GENERALIZA simularCaixaDuplo: qualquer banco com programasEspeciais no
  //    critério base pode retornar mais de um SimulationCriteria aqui.
  // 3. Retorna um array — 1 elemento para a maioria dos bancos, N para bancos com programas
  //    especiais aplicáveis (Caixa hoje; BB e Inter quando Pró-Cotista for implementado).
}
```

`engine.ts` (ou quem o chama) itera sobre o array retornado e roda **a mesma função de cálculo genérica** para cada item — sem saber se veio de 1 ou de 3 critérios, e sem saber que um deles se chama "Pró-Cotista".

Isso também resolve o item 15/16 do diagnóstico: a lógica de "Caixa retorna múltiplas linhas" deixa de ser uma função `simularCaixaDuplo` só dela e vira comportamento de qualquer banco que declare `programasEspeciais`.

**Onde a configuração de banco (dado, não código) continua vivendo**: `constantes.ts` continua sendo o lugar dos valores-base por banco (o que hoje é `BANCOS_CONFIG`), e a tabela `bancos` no Supabase + `BancosLista.tsx` continuam sendo os overrides editáveis — mas ambos agora preenchem campos de `SimulationCriteria`, não de `BancoConfig`. Isso também é a correção natural do bug já identificado em `mapa-parametros-engine.md` (`taxaAdmin` editável na UI mas nunca lido pelo cálculo) — vira, por construção, impossível de esquecer, porque `tarifaAdministracaoMensal` passa a ser um campo obrigatório do objeto que a função de cálculo já consome.

---

## 5. Novo núcleo de cálculo — uma função em vez de seis

Hoje: `calcularSAC`, `calcularPRICE`, `calcularSACItau`, `calcularPRICEItau`, `calcularSACCaixa`, `calcularPRICECaixa`. Proposta: uma função por sistema de amortização, cada uma parametrizada por `SimulationCriteria`:

```ts
function calcularAmortizacao(
  sistema: 'SAC' | 'PRICE',
  principal: number,
  valorImovel: number,
  valorAvaliacao: number,
  taxaMensal: number,
  prazo: number,
  dataNascimento: string,
  criteria: SimulationCriteria,
  dataBase?: Date,
): ResultadoCalculo {
  // 1. Resolve a base do DFI (valor do imóvel ou de avaliação) via criteria.seguro.dfi.base
  // 2. Resolve o MIP mês a mês via um dispatcher único de EstrategiaSeguro (ver seção 6)
  // 3. Se criteria.seguro.prePagamentoNoMesZero, soma o mês 0 (hoje só Itaú)
  // 4. Se criteria.seguro.incluirNaUltimaParcela === false, zera MIP/DFI no último mês (hoje Itaú + Caixa)
  // 5. Soma criteria.tarifaAdministracaoMensal em toda parcela (hoje só Caixa, hardcoded)
  // 6. Amortização SAC ou fórmula PRICE — matemática idêntica à de hoje, sem duplicação
}
```

Isso elimina os itens 3, 4 e 12 do diagnóstico. As 3 famílias de função viram 1.

## 6. Estratégia de seguro — um dispatcher único

```ts
function resolverTaxaMip(estrategia: EstrategiaSeguro, idadeAnos: number, idadeFloor: number, mes: number): number {
  switch (estrategia.tipo) {
    case 'faixa-etaria':    /* hoje: getMipRate — genérica */
    case 'teto-idade':      /* hoje: getCaixaMipRate / getInterMipRate — mesma função, tabela diferente */
    case 'flat':             return estrategia.taxa /* hoje: DAYCOVAL_MIP_RATE */
    case 'periodo-e-idade':  /* hoje: getItauMipRate — dois períodos */
  }
}
```

Elimina os itens 2 e 5 do diagnóstico — 4 implementações viram 1 função + 1 tipo de dado.

## 7. Conversão de taxa anual → mensal

```ts
function taxaAnualParaMensal(taxaAnual: number, metodo: MetodoConversaoTaxa): number {
  const raw = Math.pow(1 + taxaAnual, 1 / 12) - 1
  return metodo === 'composta-truncada-15-casas' ? Math.trunc(raw * 1e15) / 1e15 : raw
}
```

Elimina o item 1. Se outro banco algum dia mostrar o mesmo comportamento de truncamento do Itaú, é uma linha de configuração, não uma nova função.

## 8. Elegibilidade e restrições — de `if (cfg.id === ...)` para leitura de critério

| Regra | Hoje | Depois |
|---|---|---|
| PRICE suportado (item 11) | `!cfg.suportaPrice` | `!criteria.amortizacoesSuportadas.includes('PRICE')` |
| Penalidade LTV imóvel usado (item 8) | `cfg.id === 'caixa' && ...` | `criteria.ltv.penalidadeImovelUsado ?? 0` aplicado sempre que existir |
| Idade + prazo (item 6) | `LIMITE_IDADE_PRAZO_MESES` global | `criteria.limiteIdadePrazoMeses` |
| Corte duro de idade (item 7) | `idadeAnos >= 80` fixo | `criteria.idadeMaximaAbsoluta` (opcional — omitir se não houver fonte, em vez de assumir 80 para todos) |
| Comprometimento de renda (item 14) | só Caixa tem variante PRICE | `criteria.comprometimentoRenda.price ?? criteria.comprometimentoRenda.sac` |
| ITBI incorporável (item 13) | só Itaú | `criteria.itbi?.permiteIncorporar` |
| Modalidade suportada — lote/construção/comercial (item 17) | `id !== 'caixa'` | `!criteria.modalidadesSuportadas.includes(op)` |

---

## 9. O que muda em cada arquivo

| Arquivo | Mudança |
|---|---|
| `src/lib/simuladorFinanciamento/criteria.ts` | **Novo.** Define `SimulationCriteria` e os tipos auxiliares (seção 3). |
| `src/lib/simuladorFinanciamento/criteria-resolver.ts` | **Novo.** Monta `SimulationCriteria[]` a partir de `BANCOS_CONFIG` + overrides do DB + programas especiais elegíveis (seção 4). Substitui a lógica hoje espalhada em `simularBanco`/`simularCaixaDuplo`. |
| `src/lib/simuladorFinanciamento/constantes.ts` | `BANCOS_CONFIG` deixa de ser `Record<BancoId, BancoConfig>` consumido diretamente pelo engine e passa a ser o dado-fonte que o `criteria-resolver` traduz para `SimulationCriteria`. `MCMV_FAIXAS`/`CAIXA_PRO_COTISTA` viram entradas de `programasEspeciais` no critério da Caixa, em vez de constantes importadas diretamente pelo `engine.ts`. |
| `src/lib/simuladorFinanciamento/engine.ts` | Remove `calcularSACItau`, `calcularPRICEItau`, `calcularSACCaixa`, `calcularPRICECaixa`, `getItauMipRate`, `getCaixaMipRate`, `getInterMipRate`, `taxaAnualParaMensalItau`, `simularCaixaDuplo`, e todo `if (cfg.id === ...)`. Ganha `calcularAmortizacao` única e `resolverTaxaMip` único. `simularTodosBancos` passa a chamar `resolverCriterios` e iterar sobre o resultado sem saber nomes de banco. |
| `src/lib/simuladorFinanciamento/tipos.ts` | `BancoSimOverrides` (hoje em `engine.ts`) é substituído/absorvido por `Partial<SimulationCriteria>` — unifica o mecanismo de override com o próprio modelo de critério, eliminando a duplicação de conceito entre "config" e "override". |
| Tabela `bancos` (Supabase) | Precisa de novas colunas para os campos hoje sem caminho de configuração: `suporta_price` (bool), `comprometimento_max_price`, `ltv_max_price`, `penalidade_ltv_usado`, `limite_idade_prazo_meses`, `modalidades_suportadas` (array/jsonb), `itbi_permite_incorporar`, `itbi_percentual_padrao`. Migração aditiva, sem quebrar dados existentes (todas com default = comportamento atual). |
| `BancosLista.tsx` | Ganha campos de formulário para os itens acima — é o que finalmente torna as descobertas de `plano-calibracao.md` (habilitar PRICE no Bradesco/BB, Pró-Cotista no BB/Inter) editáveis sem deploy de código. |

---

## 10. Plano de migração (faseado, sem quebrar produção)

A ordem aqui **não** é a mesma do `plano-calibracao.md` (que prioriza qualidade de dado, começando pela Caixa). Para refatoração de código, o critério é o oposto: **começar pelos bancos que já usam o caminho genérico**, provar a nova arquitetura contra eles, e só depois migrar os dois bancos com função de cálculo duplicada (Itaú e Caixa), que são estruturalmente mais arriscados.

### Fase 0 — Fundação (aditiva, zero risco)
- Criar `criteria.ts` e `criteria-resolver.ts`.
- `resolverCriterios` monta `SimulationCriteria` a partir do `BancoConfig` atual **sem que nada mais no sistema use esse resultado ainda**. Só para validar que o objeto é montado corretamente para os 7 bancos.
- Escrever testes de regressão que fixam os **casos-âncora já verificados nos comentários de `constantes.ts`** (ex.: Caixa DFI "R$33,00 em R$500k", Itaú "DOB 29/12/1980, prazo 396 meses, saldo R$1.054.500", Inter "R$264,84 em R$1.411.000", Daycoval "R$46,00 em R$200.000") como golden tests — eles vão validar cada fase seguinte sem depender de acesso a simulador real de novo.

### Fase 1 — Bancos "genéricos" primeiro (Bradesco, Santander, BB)
- Esses 3 bancos já usam `calcularSAC`/`calcularPRICE` sem nenhuma especialização (não passam por Itaú nem Caixa). São o menor risco de regressão.
- Trocar as chamadas para `calcularAmortizacao` unificada, com `SimulationCriteria` gerado por `resolverCriterios`.
- Validar contra os golden tests + rodar as simulações desses 3 bancos com os mesmos inputs de antes e comparar byte a byte o resultado (`primeiraParcela`, `ultimaParcela`, `totalJuros`, `totalSeguros`).
- **Critério de saída da fase**: resultado idêntico ao motor atual para os 3 bancos, em pelo menos os casos de teste existentes + 10 combinações adicionais de idade/prazo/valor cobrindo bordas (idade próxima de 80, LTV no limite, PRICE vs SAC).

### Fase 2 — Inter e Daycoval
- Migram o dispatcher de MIP/DFI para `EstrategiaSeguro` (`teto-idade` para Inter, `flat` para Daycoval) — ainda sem tocar em função de cálculo especial, porque nenhum dos dois tem.
- Esta fase também é o momento natural de **resolver o item 1 da lista de "erros de regra" do `plano-calibracao.md`** (taxa/prazo do Inter suspeitos) — não porque a refatoração corrija o número sozinha, mas porque é o momento em que alguém vai mexer no critério do Inter e validar contra o simulador oficial de qualquer forma.

### Fase 3 — Itaú (o mais arriscado dos dois especiais)
- Extrair `prePagamentoNoMesZero`, `incluirNaUltimaParcela: false`, `metodoConversaoTaxa: 'composta-truncada-15-casas'`, `seguro.dfi.base: 'valor-avaliacao'` e `itbi.permiteIncorporar` como campos do critério do Itaú.
- Rodar `calcularAmortizacao` genérica com esse critério e comparar contra `calcularSACItau`/`calcularPRICEItau` linha a linha (mês a mês, não só total) para os casos-âncora já documentados nos comentários (idades 44–54 e o caso de prazo 396 meses).
- Só remover `calcularSACItau`/`calcularPRICEItau` depois de bater 100% nos golden tests mês a mês, não só no total.

### Fase 4 — Caixa (o mais estrutural, por causa dos programas especiais)
- Generalizar `simularCaixaDuplo` em `programasEspeciais` dentro do critério da Caixa (Pró-Cotista + 4 faixas MCMV), consumido pelo `criteria-resolver` genérico.
- Extrair `tarifaAdministracaoMensal` e `incluirNaUltimaParcela: false` como campos do critério da Caixa.
- Mesma disciplina de validação mês a mês da Fase 3, incluindo os 3 programas (SBPE, Pró-Cotista, MCMV) separadamente.
- Só remover `calcularSACCaixa`/`calcularPRICECaixa`/`simularCaixaDuplo` após validação completa.

### Fase 5 — Generalizar restrições de modalidade
- Trocar os `if (id !== 'caixa' && op === ...)` por leitura de `criteria.modalidadesSuportadas`.
- **Não muda comportamento nesta fase** — todo banco continua com `modalidadesSuportadas: ['aquisicao']` exceto a Caixa (que ganha `['aquisicao', 'comercial', 'lote_urbanizado', 'construcao_terreno_proprio', 'terreno_mais_construcao']`), preservando exatamente a cobertura atual. Isso só habilita que, quando `plano-calibracao.md` validar os produtos de terreno/construção de Itaú/Bradesco/BB no simulador oficial, ativar a cobertura seja uma mudança de dado, não de código.

### Fase 6 — Expor os novos campos na UI de configuração
- Adicionar a `BancosLista.tsx` os campos que hoje não têm caminho de configuração (`suporta_price`, `comprometimento_max_price`, `ltv_max_price`, `penalidade_ltv_usado`, `limite_idade_prazo_meses`, `itbi_permite_incorporar`).
- É o ponto em que as descobertas de `plano-calibracao.md` (habilitar PRICE no Bradesco/BB com os dados já confirmados oficialmente, Pró-Cotista no BB/Inter) se tornam operacionalmente possíveis sem deploy.
- Corrigir, como efeito colateral natural desta fase, o bug do `taxaAdmin` nunca lido (ele deixa de existir como bug porque `tarifaAdministracaoMensal` passa a ser um campo do objeto que a função de cálculo sempre lê).

---

## 11. Estratégia de validação (todas as fases)

1. **Golden tests primeiro, código depois.** Antes de tocar em qualquer função, os casos já verificados empiricamente nos comentários de `constantes.ts` viram testes automatizados fixos. Eles existem hoje só como comentário — formalizá-los é pré-requisito, não parte da refatoração em si.
2. **Comparação byte a byte, não só "parece igual".** Cada fase só é considerada concluída quando `primeiraParcela`, `ultimaParcela`, `totalJuros`, `totalSeguros` e `totalPago` do motor novo batem exatamente com o motor antigo para os mesmos inputs — não uma aproximação.
3. **Rodar os dois motores em paralelo antes de remover o antigo.** Cada função antiga (`calcularSACItau` etc.) só é deletada depois que a nova função genérica, alimentada pelo critério equivalente, produzir resultado idêntico em todos os casos de teste — nunca antes.
4. **Ordem de risco crescente.** Bancos sem especialização primeiro (Fase 1), depois os com especialização simples de tabela (Fase 2), depois os com função de cálculo totalmente duplicada (Fases 3 e 4). Isso significa que, se algo der errado, o raio de impacto de cada fase é conhecido e crescente, nunca surpresa.

---

## 12. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Migrar Itaú/Caixa (Fases 3–4) introduzir uma diferença sutil no cálculo mês a mês que só aparece em prazos muito longos ou idades no limite | Golden tests mês a mês (não só total), cobrindo especificamente os casos de borda já documentados nos comentários do código atual |
| `criteria-resolver.ts` virar um novo ponto de acoplamento escondido (trocar "if de banco no engine" por "if de banco no resolver" sem ganho real) | O resolver **pode** ter lógica específica por banco — isso é aceitável e esperado, porque ali é onde reside a regra de *produto* (o que cada banco oferece), não a regra de *cálculo*. O ganho arquitetural é que o motor de cálculo nunca mais precisa saber disso, não que o conhecimento sobre bancos desapareça do sistema |
| Nova coluna no banco de dados (`modalidades_suportadas`, etc.) sem migração cuidadosa quebrar leitura de config existente | Todas as colunas novas propostas têm default equivalente ao comportamento hardcoded atual — nenhum banco muda de comportamento só por causa da migração de schema |
| Expandir `BancosLista.tsx` (Fase 6) permitir que alguém habilite PRICE ou um produto novo num banco **antes** de validar contra o simulador oficial (pulando o processo de `plano-calibracao.md`) | Fora do escopo de código — é processo operacional: a Fase 6 deveria vir com uma trava simples na UI (ex.: campo exige confirmação/nota de qual simulação real validou aquele valor) antes de liberar a edição livre |

---

## Resumo

`engine.ts` hoje mistura três responsabilidades: **calcular** (matemática de SAC/PRICE), **decidir** (qual banco faz o quê) e **conhecer** (nomes de banco, tabelas específicas). A proposta separa isso em três camadas: `criteria.ts` (o contrato), `criteria-resolver.ts` (o conhecimento sobre bancos, movido para fora do motor) e um `engine.ts` enxuto que só sabe fazer matemática a partir de um `SimulationCriteria`. A migração é faseada por risco crescente (bancos genéricos → especiais simples → especiais complexos → generalização de modalidades → exposição na UI), com golden tests dos casos já calibrados como rede de segurança em cada fase.
