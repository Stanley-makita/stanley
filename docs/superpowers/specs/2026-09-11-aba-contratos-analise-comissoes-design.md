# Aba "Contratos" em Financeiro → Análise de Comissões — Design

Data: 2026-09-11

## Objetivo

A aba Financeiro → Análise de Comissões hoje só mostra financiamentos (PR
#251). O pedido é acrescentar uma segunda sub-aba, "Contratos", que serve
como demonstrativo mensal dos contratos particulares (modalidade
`Contrato`) pagos naquele mês — reproduzindo o controle que hoje é feito
numa planilha separada. O gatilho de qual mês um contrato aparece é a
**data em que o pagamento foi confirmado**, não a data de criação/emissão.

Isso exige capturar 3 dados novos no funil de Contrato que hoje não
existem: se o cliente financiou (sim/não), quem prospectou o cliente
(Fontinhas vs. a advogada responsável, "Direto") e a confirmação/data do
pagamento em si.

## Não-objetivos

- **Cálculo de comissão da advogada usando o percentual 30/70 de
  "Prospectado por"** — fica para o desenho de uma 3ª aba futura
  ("Fechamento por Comercial", que vai juntar comissão de financiamento +
  contratos + assessoria por comercial, com um percentual configurável por
  pessoa). Aqui só capturamos e exibimos "Prospectado por" como dado.
- **Qualquer mudança na aba "Financiamento"** já existente — fica
  exatamente como está, só passa a viver como a primeira das duas
  sub-abas.
- **Suporte a múltiplos corretores/imobiliárias por processo na mesma
  linha** — um processo de Contrato pode ter mais de um corretor ou
  imobiliária vinculado (`processo_corretores`/`processo_imobiliarias`);
  a aba mostra só o primeiro de cada (caso raro, simplificação aceita).
- **Editar Financiou/Prospectado por/Data de pagamento a partir da própria
  aba de Análise de Comissões** — a edição continua acontecendo na tela do
  processo (Contrato), a aba só lê/exibe.

## Modelo de dados

### Colunas novas em `processos`

```sql
ALTER TABLE processos
  ADD COLUMN financiou BOOLEAN,
  ADD COLUMN prospectado_por TEXT CHECK (prospectado_por IN ('fontinhas', 'direto')),
  ADD COLUMN data_pagamento_contrato DATE;
```

- `financiou`: `NULL` = não informado ainda, `true`/`false` = sim/não.
- `prospectado_por`: mesmo padrão de `responsavel_registro` (coluna texto
  com CHECK, sem tabela de catálogo — só 2 valores fixos, não precisa ser
  configurável).
- `data_pagamento_contrato`: `NULL` enquanto não confirmado. A presença
  dela é o "confirmado" — não precisa de coluna de status separada.

### Função `analise_comissoes_contratos_mes`

Mesmo padrão de `analise_comissoes_mes` (migration 292): `SECURITY
DEFINER`, guarda de acesso por `empresa_id`, todas as referências de
coluna qualificadas com alias (a migration 292 já bateu no bug de
ambiguidade do PL/pgSQL com `RETURNS TABLE` — replicar o cuidado aqui).

```sql
CREATE OR REPLACE FUNCTION analise_comissoes_contratos_mes(
  p_empresa_id UUID,
  p_mes        INTEGER,
  p_ano        INTEGER
)
RETURNS TABLE (
  id                       UUID,
  processo_id              UUID,
  cliente_nome             TEXT,
  cliente_cpf              TEXT,
  comercial_nome           TEXT,
  corretor_nome            TEXT,
  imobiliaria_nome         TEXT,
  prospectado_por          TEXT,
  financiou                BOOLEAN,
  valor_contrato           NUMERIC,
  data_pagamento_contrato  DATE
)
```

Filtro: `p.modalidade = 'Contrato' AND p.data_pagamento_contrato IS NOT NULL
AND EXTRACT(MONTH FROM p.data_pagamento_contrato) = p_mes AND EXTRACT(YEAR
FROM p.data_pagamento_contrato) = p_ano`. Corretor/imobiliária via
`LEFT JOIN LATERAL` pegando o primeiro vínculo de cada tabela (mesmo
padrão de "comprador principal" já usado nas outras funções de
Financeiro).

## Backend (hooks)

- `useAnaliseComissoesContratosMes(mes, ano)` — mesmo padrão de
  `useAnaliseComissoesMes`, chama a RPC acima.
- `useAtualizarFinanciouProspectado(processo_id)` — update direto em
  `processos` (`financiou`, `prospectado_por`), mesmo padrão de
  `useAtualizarCgiManual`.
- `useConfirmarPagamentoContrato(processo_id)` — update
  `data_pagamento_contrato`. Aceita `null` também, pra permitir desfazer.

## UI

### Card "Pagamento" no Processo de Contrato (`ContratoConstrutor.tsx`)

Novo card sempre visível, ao lado dos cards de Responsáveis e Modelo de
contrato/Valor do Serviço (mesma linha, 3 colunas em telas largas em vez
de 2 — ou quebra pra a linha de baixo se ficar apertado; decido isso na
implementação olhando o resultado, sem desfazer o ajuste de layout já
feito por feedback do usuário nos PRs #253/#254). Conteúdo:

- Select "Financiou" (Sim/Não/—)
- Select "Prospectado por" (Fontinhas/Direto/—)
- Bloco de pagamento:
  - Não confirmado: botão "Confirmar Pagamento" → abre um mini-formulário
    inline (ou modal pequeno, reaproveitando o padrão já usado em
    `AbaConsorcio.tsx`/"Registrar Recebimento") com um campo de data
    pré-preenchido com hoje, editável.
  - Confirmado: mostra "Pago em DD/MM/AAAA" com um ícone de lápis que
    reabre o mesmo mini-formulário pra corrigir a data, e uma opção de
    desfazer (volta `data_pagamento_contrato` pra `null`).

### Sub-abas em `AbaAnaliseComissoes.tsx`

Vira uma casca com 2 botões de sub-aba (mesmo padrão visual de
`AbaConsorcio.tsx`): "Financiamento" (aponta pro componente atual, sem
mudança de comportamento) e "Contratos" (novo).

### Visão "Contratos"

- KPIs no topo: Contratos (contagem), Valor total (soma de
  `valor_contrato` dos filtrados).
- Busca por cliente/CPF (mesmo padrão da visão Financiamento).
- Tabela: Cliente, CPF, Comercial, Corretor, Imobiliária, Prospectado por,
  Financiou, Valor, Data de Recebimento.
- Usa o mesmo `mes`/`ano` já navegável no topo da página Financeiro.

## Testes / validação manual

- Criar/editar um Contrato: preencher Financiou e Prospectado por,
  confirmar pagamento com uma data dentro do mês corrente — aparece na
  aba Contratos do mês certo.
- Mudar a data de pagamento pra um mês diferente — o contrato deve sumir
  do mês antigo e aparecer no novo ao navegar os meses no topo.
- Desfazer a confirmação de pagamento — o contrato some da aba até ser
  confirmado de novo.
- Conferir que a aba "Financiamento" continua idêntica a antes (nenhuma
  regressão visual/funcional).
