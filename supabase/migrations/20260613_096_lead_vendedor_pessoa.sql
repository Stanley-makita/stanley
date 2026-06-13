-- 096: vendedor vinculado como pessoa no lead
-- Permite buscar/criar vendedor do cadastro geral e reutilizá-lo em múltiplos processos

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS vendedor_pessoa_id UUID REFERENCES pessoas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_vendedor_pessoa_id ON leads(vendedor_pessoa_id) WHERE vendedor_pessoa_id IS NOT NULL;
