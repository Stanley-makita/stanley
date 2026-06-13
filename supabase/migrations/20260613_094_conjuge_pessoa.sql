-- 094: conjuge_pessoa_id em leads e pessoas
-- Permite vincular o cônjuge como uma pessoa completa no sistema (pesquisável, cadastro pleno)

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS conjuge_pessoa_id UUID REFERENCES pessoas(id) ON DELETE SET NULL;

ALTER TABLE pessoas
  ADD COLUMN IF NOT EXISTS conjuge_pessoa_id UUID REFERENCES pessoas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_conjuge_pessoa_id ON leads(conjuge_pessoa_id) WHERE conjuge_pessoa_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pessoas_conjuge_pessoa_id ON pessoas(conjuge_pessoa_id) WHERE conjuge_pessoa_id IS NOT NULL;
