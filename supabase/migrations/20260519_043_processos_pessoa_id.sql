-- Adiciona pessoa_id em processos para criar processo diretamente da tela de Pessoa,
-- sem necessidade de um Lead de origem. lead_id já era nullable.

ALTER TABLE processos
  ADD COLUMN IF NOT EXISTS pessoa_id UUID REFERENCES pessoas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_processos_pessoa_id ON processos(pessoa_id);
