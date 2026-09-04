-- Origens de Lead Customizadas — Task 2/2.
--
-- leads.origem deixa de ser o enum lead_origem — vira TEXT livre. Os
-- webhooks continuam inserindo os mesmos literais de sempre ('site',
-- 'whatsapp' etc.), então nada mais no código precisa mudar por causa
-- desta migration. Sem FK contra origens_lead.codigo de propósito (mesmo
-- padrão de confiança já usado em outras colunas texto deste projeto,
-- ex. perfil_permissoes.acao) — o catálogo valida na UI, não no banco.
--
-- O tipo lead_origem (enum) não é dropado — fica órfão no schema,
-- inofensivo, mais simples e seguro que tentar removê-lo.

ALTER TABLE leads ALTER COLUMN origem TYPE TEXT USING origem::text;
