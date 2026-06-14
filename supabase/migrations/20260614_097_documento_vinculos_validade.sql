-- Junction table: um documento pode ser vinculado a múltiplos processos
CREATE TABLE IF NOT EXISTS documento_processo_vinculos (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id    UUID NOT NULL REFERENCES empresas(id),
  documento_id  UUID NOT NULL REFERENCES documentos_clientes(id) ON DELETE CASCADE,
  processo_id   UUID NOT NULL REFERENCES processos(id) ON DELETE CASCADE,
  vinculado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  vinculado_por UUID REFERENCES usuarios(id),
  UNIQUE(documento_id, processo_id)
);

CREATE INDEX IF NOT EXISTS idx_dpv_processo  ON documento_processo_vinculos(processo_id);
CREATE INDEX IF NOT EXISTS idx_dpv_documento ON documento_processo_vinculos(documento_id);

-- Metadados de validade nos documentos
ALTER TABLE documentos_clientes
  ADD COLUMN IF NOT EXISTS permanente    BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS validade_data DATE,
  ADD COLUMN IF NOT EXISTS validade_dias INTEGER;
