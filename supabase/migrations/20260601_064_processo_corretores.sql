-- Migration: Corretores e Imobiliária por processo

-- 1. Coluna imobiliaria_id em processos
ALTER TABLE processos
  ADD COLUMN IF NOT EXISTS imobiliaria_id UUID REFERENCES pessoas(id) ON DELETE SET NULL;

-- 2. Tabela processo_corretores (com campos denormalizados igual a processo_compradores)
CREATE TABLE processo_corretores (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  processo_id UUID        NOT NULL REFERENCES processos(id) ON DELETE CASCADE,
  pessoa_id   UUID        REFERENCES pessoas(id) ON DELETE SET NULL,
  empresa_id  UUID        NOT NULL,
  nome        TEXT        NOT NULL,
  telefone    TEXT,
  principal   BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (processo_id, pessoa_id)
);

CREATE INDEX idx_processo_corretores_processo ON processo_corretores(processo_id);

ALTER TABLE processo_corretores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "processo_corretores_select" ON processo_corretores
  FOR SELECT USING (empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid()));

CREATE POLICY "processo_corretores_insert" ON processo_corretores
  FOR INSERT WITH CHECK (empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid()));

CREATE POLICY "processo_corretores_update" ON processo_corretores
  FOR UPDATE USING (empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid()));

CREATE POLICY "processo_corretores_delete" ON processo_corretores
  FOR DELETE USING (empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid()));
