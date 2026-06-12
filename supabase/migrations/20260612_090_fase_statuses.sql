-- ============================================================
-- Migration 090: Status configuráveis por fase de Lead
-- Tabela fase_statuses + campo status_id em leads
-- ============================================================

-- ═══ 1. Tabela fase_statuses ════════════════════════════════
CREATE TABLE fase_statuses (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  fase_id     UUID        NOT NULL REFERENCES fases(id) ON DELETE CASCADE,
  empresa_id  UUID        NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome        TEXT        NOT NULL,
  cor         TEXT        NOT NULL DEFAULT '#6B7280',
  ordem       INTEGER     NOT NULL DEFAULT 0,
  ativo       BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (fase_id, nome)
);

CREATE INDEX idx_fase_statuses_fase   ON fase_statuses(fase_id, ordem) WHERE ativo = true;
CREATE INDEX idx_fase_statuses_empresa ON fase_statuses(empresa_id);

ALTER TABLE fase_statuses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fase_statuses_select" ON fase_statuses
  FOR SELECT USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid())
  );

CREATE POLICY "fase_statuses_insert" ON fase_statuses
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND perfil IN ('admin', 'gerente'))
  );

CREATE POLICY "fase_statuses_update" ON fase_statuses
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND perfil IN ('admin', 'gerente'))
  );

CREATE POLICY "fase_statuses_delete" ON fase_statuses
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND perfil IN ('admin', 'gerente'))
  );

-- ═══ 2. Campo status_id em leads ════════════════════════════
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS status_id UUID REFERENCES fase_statuses(id) ON DELETE SET NULL;

CREATE INDEX idx_leads_status_id ON leads(status_id) WHERE status_id IS NOT NULL;

-- ═══ 3. RPC: reordenar statuses de uma fase ═════════════════
CREATE OR REPLACE FUNCTION reordenar_fase_statuses(statuses_input JSONB)
RETURNS VOID AS $$
DECLARE
  emp_id UUID;
BEGIN
  emp_id := (SELECT empresa_id FROM usuarios WHERE id = auth.uid());
  UPDATE fase_statuses fs
  SET ordem = (item->>'ordem')::INTEGER
  FROM jsonb_array_elements(statuses_input) AS item
  WHERE fs.id = (item->>'id')::UUID
    AND fs.empresa_id = emp_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
