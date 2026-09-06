# Origens de Lead Customizadas — Design

Data: 2026-09-04

## Objetivo

Hoje o campo "Origem" de um Lead (visível no card Classificação da aba
Oportunidade, e em outras 4 telas de preenchimento manual) é uma lista fixa
de 11 valores hardcoded no código (`Indicação`, `Site`, `WhatsApp`,
`Instagram`, `Facebook`, `Direto`, `Corretor`, `Imobiliária`, `Construtora`,
`Parceiro Comercial`, `Outros`). O pedido é poder gerenciar essa lista pela
tela `Configurações → Origens de Leads`: renomear qualquer uma, e
criar/renomear/desativar as que não são automáticas.

## Não-objetivos

- Não altera o comportamento dos webhooks/bot que criam leads automaticamente
  (Site, WhatsApp, Instagram, Facebook, Indicação) — eles continuam gravando
  exatamente os mesmos códigos internos de sempre.
- Não permite excluir fisicamente nenhuma origem (nem as automáticas nem as
  manuais) — só desativar (soft-delete) as manuais, pra não invalidar leads
  antigos que já referenciam aquele valor.
- Não permite excluir nem desativar as 5 origens automáticas — só renomear o
  rótulo exibido. Excluir uma quebraria o webhook correspondente (ele
  continuaria tentando gravar um valor que sumiu do catálogo).
- Não mexe em `canais_leads_config` (liga/desliga o CANAL de ingestão
  automática em si — ex: "parar de aceitar leads do Instagram") — é um
  mecanismo diferente e complementar a este, já existente, fora de escopo.

## Modelo de dados

### Tabela nova `origens_lead`

```sql
CREATE TABLE origens_lead (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID        NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  codigo      TEXT        NOT NULL,
  nome        TEXT        NOT NULL,
  sistema     BOOLEAN     NOT NULL DEFAULT false,
  ativo       BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, codigo)
);
```

- `codigo`: valor estável, é o que de fato fica gravado em `leads.origem` —
  nunca editável pela UI, nem para linhas `sistema=true` nem para as
  criadas manualmente (uma vez criada, uma origem manual também não tem seu
  `codigo` alterado — só o `nome`).
- `nome`: rótulo exibido, sempre editável (inclusive nas `sistema=true`).
- `sistema=true`: as 5 automáticas (`site`, `whatsapp`, `instagram`,
  `facebook`, `indicacao`) — não podem ser desativadas nem excluídas, só
  renomeadas.
- `sistema=false`: as 6 manuais existentes (`direto`, `corretor`,
  `imobiliaria`, `construtora`, `parceiro_comercial`, `outros`) mais
  qualquer nova criada pela tela — aceitam criar, renomear, desativar.

RLS: SELECT liberado pra qualquer usuário ativo da empresa (necessário nos
dropdowns de preenchimento manual, usados por qualquer perfil com
`leads.criar`/`leads.editar`); INSERT/UPDATE só para quem tem
`configuracoes.editar` — mesmo padrão de outras tabelas de configuração
deste projeto (ex: `canais_leads_config`), não introduz uma checagem de
perfil nova.

Migration de seed (roda uma vez, populando a tabela pra toda empresa
existente com as 11 linhas atuais — texto e código idênticos ao que já
está em produção hoje, pra não mudar nada visualmente até alguém editar):

```sql
INSERT INTO origens_lead (empresa_id, codigo, nome, sistema)
SELECT id, v.codigo, v.nome, v.sistema
FROM empresas
CROSS JOIN (VALUES
  ('site',               'Site',               true),
  ('whatsapp',           'WhatsApp',           true),
  ('instagram',          'Instagram',          true),
  ('facebook',           'Facebook',           true),
  ('indicacao',          'Indicação',          true),
  ('direto',             'Direto',             false),
  ('corretor',           'Corretor',           false),
  ('imobiliaria',        'Imobiliária',        false),
  ('construtora',        'Construtora',        false),
  ('parceiro_comercial', 'Parceiro Comercial', false),
  ('outros',             'Outros',             false)
) AS v(codigo, nome, sistema);
```

### Coluna `leads.origem`

Deixa de ser o enum `lead_origem` — vira `TEXT`. Sem FK forçada contra
`origens_lead.codigo` (mesmo padrão de confiança já usado em outras colunas
texto do projeto, ex. `perfil_permissoes.acao`). Nenhum default, continua
`NOT NULL`. O tipo `lead_origem` (enum) não precisa ser dropado — fica
órfão no schema, inofensivo, mais simples que tentar removê-lo com
segurança.

```sql
ALTER TABLE leads ALTER COLUMN origem TYPE TEXT USING origem::text;
```

## Backend

Nenhuma rota de API nem função SQL de permissão precisa mudar — `origem`
não participa de nenhuma regra de RLS hoje (confirmado: só o valor
`origem === 'whatsapp'` aparece em UMA checagem de UI, puramente cosmética,
em `NovoProcessoModal.tsx`, sem efeito de segurança). Os webhooks
(`api/leads/webhook`, `api/instagram/webhook`, `api/parceiros/webhook/indicacao`,
`api/bot/whatsapp/webhook`, `api/bot/site/message`) continuam inserindo os
mesmos literais de sempre (`'site'`, `'whatsapp'` etc.) — como a coluna
virou TEXT, isso continua funcionando sem nenhuma alteração nesses arquivos.

## Interface

### Novo item em Configurações: "Origens de Leads"

Item novo, irmão de "Canais de Captação" na mesma lista de cards (não uma
sub-aba dentro dele — o padrão desta tela é card único por assunto).
`key: 'origens-leads'`, ícone a escolher (ex: `Tag` ou `ListFilter`).

Tela: lista simples das origens da empresa (badge "Automática" nas
`sistema=true`), botão "Editar nome" em todas, "Desativar"/"Reativar" só
nas manuais, botão "+ Nova origem" no topo (só pede o nome; código é
gerado automaticamente — ex: slug do nome, com dedupe se colidir).

### 5 telas com dropdown de origem (preenchimento manual)

`AbaOportunidade.tsx`, `AbaCredito.tsx`, `NovoProcessoModal.tsx`,
`LeadFormDrawer.tsx`, `LeadEditarModal.tsx` — cada uma tem hoje um array
fixo de `<SelectItem>` com os 11 valores. Passam a buscar as origens ativas
da empresa (`useOrigensLead()`, novo hook) e renderizar a partir dali.
Origem já selecionada num lead existente aparece mesmo se `ativo=false`
(mesma lógica já usada pra perfil customizado desativado em
`UsuarioFormDrawer` — não trava a edição, só some da lista de novas
escolhas).

### `LeadOrigemBadge.tsx`

Hoje é um `Record<LeadOrigem, {label, className}>` fixo. Passa a resolver
`nome` a partir da lista de `origens_lead` (via hook), com fallback de cor
genérica (`bg-gray-50 text-gray-600 border-gray-200`) pra qualquer `codigo`
que não seja encontrado (defensivo — não deveria acontecer, mas evita
badge quebrado se a lista ainda não carregou).

### Tipo `LeadOrigem`

`src/types/leads.ts`: `LeadOrigem` deixa de ser union fechada de 11
literais e vira `string`. Os 3 arquivos que hoje tipam algo como
`LeadOrigem` (`LeadListView.tsx`, `LeadDetalheModal.tsx`,
`AbaVisaoGeral.tsx`) continuam compilando sem mudança de lógica — só
passam a aceitar qualquer string, não mais um conjunto fechado.

## Casos de borda

- **Origem automática renomeada**: só o rótulo muda; o webhook continua
  gravando o mesmo `codigo`, então leads antigos e novos mostram o novo
  nome igualmente — não há inconsistência histórica.
- **Origem manual desativada com leads existentes**: leads antigos
  continuam mostrando o nome salvo (resolvido pelo `codigo`, que não muda);
  só some do dropdown de novas seleções.
- **Nome duplicado**: sem `UNIQUE` no nome (só no `codigo` por empresa) —
  aceitável, é só um rótulo; não há necessidade de travar isso.
- **Slug de código colide** ao criar uma origem manual nova com nome
  parecido a uma existente (ex: duas chamadas "Parceiro"): dedupe simples
  (sufixo numérico no código) na hora de gerar, transparente pro usuário.

## Migrations

1. `origens_lead` (tabela + RLS + seed pra empresas existentes).
2. `ALTER TABLE leads ALTER COLUMN origem TYPE TEXT`.

## Testes

- Unitário: resolução de nome/cor no `LeadOrigemBadge` com origem
  encontrada, não encontrada (fallback), e origem automática vs. manual.
- Unitário: geração de `codigo` (slug) na criação de origem nova, incluindo
  o caso de colisão/dedupe.
- Manual: renomear uma automática (ex: "WhatsApp" → "WhatsApp Business"),
  confirmar badge/dropdowns refletem o novo nome sem quebrar nada;
  desativar uma manual, confirmar que some do dropdown mas continua visível
  em leads antigos; criar uma nova origem manual, confirmar que aparece nas
  5 telas de preenchimento.
