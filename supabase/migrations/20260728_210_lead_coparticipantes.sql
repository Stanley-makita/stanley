-- ============================================================
-- Migration 210: Coparticipantes avulsos no Lead
-- Permite anexar pessoas sem vínculo familiar (não é cônjuge) como
-- compradores adicionais ainda na fase de Captação, espelhando o que
-- processo_compradores já faz para Negócios (migration 005).
-- ============================================================

CREATE TABLE IF NOT EXISTS lead_coparticipantes (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID        NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  lead_id     UUID        NOT NULL REFERENCES leads(id)    ON DELETE CASCADE,
  pessoa_id   UUID        NOT NULL REFERENCES pessoas(id)  ON DELETE CASCADE,
  papel       TEXT        NOT NULL DEFAULT 'coproponente',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (lead_id, pessoa_id)
);

CREATE INDEX IF NOT EXISTS idx_lead_coparticipantes_lead   ON lead_coparticipantes(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_coparticipantes_pessoa ON lead_coparticipantes(pessoa_id);

ALTER TABLE lead_coparticipantes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lead_coparticipantes_select" ON lead_coparticipantes
  FOR SELECT USING (empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true));
CREATE POLICY "lead_coparticipantes_insert" ON lead_coparticipantes
  FOR INSERT WITH CHECK (empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true));
CREATE POLICY "lead_coparticipantes_delete" ON lead_coparticipantes
  FOR DELETE USING (empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true));
