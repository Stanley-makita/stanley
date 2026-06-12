-- Adiciona campo responsavel_operacional_id à tabela leads
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS responsavel_operacional_id UUID REFERENCES usuarios(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_responsavel_operacional
  ON leads(responsavel_operacional_id)
  WHERE responsavel_operacional_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
