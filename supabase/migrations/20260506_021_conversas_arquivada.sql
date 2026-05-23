ALTER TABLE conversas
  ADD COLUMN IF NOT EXISTS arquivada BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_conversas_arquivada ON conversas(empresa_id, arquivada);
