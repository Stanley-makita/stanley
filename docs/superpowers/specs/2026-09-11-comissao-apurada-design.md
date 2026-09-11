# Aba "Comissão Apurada" em Financeiro → Análise de Comissões — Design

Data: 2026-09-11

## Objetivo

Terceira sub-aba de Análise de Comissões (as duas primeiras — Financiamento e
Contratos — já existem, PRs #251/#258). Mostra, por comercial escolhido num
seletor, o fechamento apurado do mês: produção total (financiamento
ponderado pela taxa do banco + contrato + assessoria), o percentual de
comissão aplicado pela faixa de produção já configurada em RH →
Comissões, o valor calculado por essa faixa, e o valor final depois de
descontar a soma do campo "CGI 1%" (já existente na aba Financiamento) dos
processos daquele comercial no período.

## Não-objetivos

- **Não recalcula nem duplica a lógica de faixa/piso/teto** — reaproveita
  a função já existente `calcular_producao_comercial_mes` (migration 240)
  tal como está, sem alterá-la.
- **Não modela o split de comissão 30/70 (Fontinhas/Direto)** discutido
  durante o design da aba Contratos — segue explicitamente fora de escopo,
  como já registrado no design daquela aba.
- **Não persiste nada novo** — é uma visão de leitura; a única edição
  relacionada (CGI 1% por processo) já existe na aba Financiamento.
- **Não muda `calcular_producao_comercial_mes` nem `comissao_comercial_calculada`**
  — só os consome via uma nova função de agregação/exibição.

## Modelo de dados

### Nova função `comissao_apurada_mes`

Mesmo padrão de `analise_comissoes_mes`/`analise_comissoes_contratos_mes`:
`SECURITY DEFINER`, guarda de acesso por `empresa_id`, toda referência de
coluna qualificada com alias.

```sql
CREATE OR REPLACE FUNCTION comissao_apurada_mes(
  p_empresa_id            UUID,
  p_comercial_usuario_id  UUID,
  p_mes                   INTEGER,
  p_ano                   INTEGER
)
RETURNS TABLE (
  qtd_processos_financiamento INTEGER,
  qtd_contratos                INTEGER,
  valor_financiamento          NUMERIC,
  comissao_financiamento       NUMERIC,
  valor_assessoria             NUMERIC,
  valor_contratos               NUMERIC,
  subtotal                     NUMERIC,
  pct_aplicado                 NUMERIC,
  comissao_calculada           NUMERIC,
  cgi_manual_total             NUMERIC,
  comissao_apurada             NUMERIC
)
```

Lógica:

1. Guarda de acesso idêntica às outras funções desta família (`usuarios`/`auth.uid()`/`ativo`).
2. Agrega, com os MESMOS filtros de `calcular_producao_comercial_mes`
   (`p.comercial_id = p_comercial_usuario_id`, `status_emissao='emitido'`,
   `modalidade <> 'Consorcio'`, `data_emissao` no mês/ano):
   - `qtd_processos_financiamento` = contagem de processos com
     `modalidade NOT IN ('Contrato', 'Consorcio')`.
   - `qtd_contratos` = contagem de processos com `modalidade = 'Contrato'`.
   - `valor_financiamento` = `SUM(valor_financiado)` bruto (só financiamento) — exibição, não entra na conta.
   - `comissao_financiamento` = `SUM(valor_financiado * comissoes_padrao.comissao_comercial / 100)`
     — mesmo `LEFT JOIN LATERAL` em `comissoes_padrao` já usado em
     `calcular_producao_comercial_mes` (banco/modalidade do comercial, não
     da empresa).
   - `valor_assessoria` = `SUM(valor_assessoria)` (todas as modalidades, igual à função-fonte).
   - `valor_contratos` = `SUM(valor_contrato)` onde `modalidade = 'Contrato'`.
   - `subtotal` = `comissao_financiamento + valor_assessoria + valor_contratos`
     (deve bater exatamente com o `producao_total` que
     `calcular_producao_comercial_mes` calcula para o mesmo comercial/mês —
     é a mesma fórmula, só quebrada em componentes para exibição).
   - `cgi_manual_total` = `SUM(cgi_manual)` dos mesmos processos de
     financiamento (`modalidade NOT IN ('Contrato', 'Consorcio')`).
3. Chama `calcular_producao_comercial_mes(p_empresa_id, p_comercial_usuario_id, p_mes, p_ano)`
   via `SELECT ... INTO` e usa o `pct_aplicado`/`comissao_total` que ela
   devolve diretamente como `pct_aplicado`/`comissao_calculada` — não
   reimplementa a busca de faixa/piso/teto.
4. `comissao_apurada` = `comissao_calculada - cgi_manual_total`.

```sql
GRANT EXECUTE ON FUNCTION comissao_apurada_mes(UUID, UUID, INTEGER, INTEGER) TO authenticated;
```

## Backend (hook)

`useComissaoApuradaMes(comercialId: string | null, mes: number, ano: number)`
em `src/hooks/financeiro/useAnaliseComissoes.ts` — mesmo padrão dos hooks
irmãos, `enabled: !!usuario && !!comercialId` (não dispara sem um comercial
selecionado).

## UI

### Sub-aba nova em `AbaAnaliseComissoes.tsx`

Terceiro botão "Comissão Apurada" ao lado de "Financiamento"/"Contratos".

### Visão "Comissão Apurada"

- Seletor "Comercial" no topo (reaproveita o mesmo padrão de listagem de
  usuários já usado em outros selects deste módulo, ex.
  `useUsuariosEmpresa`/`useMembrosAtivos` — sem filtro por perfil, mesmo
  comportamento do select de Comercial em `BlocoResponsaveis`).
- Sem comercial selecionado: mensagem "Selecione um comercial para ver o
  fechamento apurado."
- Com comercial selecionado: um quadro (cards ou tabela de uma linha só,
  a decidir na implementação olhando o resultado) com as colunas:
  Processos Financiamento, Contratos, Valor Financiamento, Comissão,
  Assessoria, Valor Contratos, Subtotal, % Aplicado, Cálculo de Comissões,
  CGI 1%, **Comissão Apurada** (destacada).

## Testes / validação manual

- Selecionar um comercial com produção só de financiamento — conferir que
  `comissao_financiamento` bate com `valor_financiado × comissoes_padrao.comissao_comercial`
  somado manualmente para os processos do mês.
- Selecionar um comercial com contratos pagos no mês (aba Contratos) —
  conferir que `valor_contratos`/`qtd_contratos` batem com o que aparece
  na aba Contratos para o mesmo comercial/mês.
- Comparar `pct_aplicado`/`comissao_calculada` com o que já aparece hoje
  em RH → Comissões / Comissões a Pagar para o mesmo comercial/mês — devem
  bater exatamente, pois vêm da mesma função.
- Preencher CGI 1% em 1+ processo do comercial na aba Financiamento e
  conferir que `cgi_manual_total`/`comissao_apurada` refletem a soma
  corretamente.
- Trocar de comercial no seletor e conferir que os números mudam
  (nenhum cache vazando entre comerciais diferentes).
