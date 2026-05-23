-- Migration: tabela lead_telefones (multi-telefone por lead) + backfill de vínculos

CREATE TABLE lead_telefones (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  empresa_id  UUID NOT NULL REFERENCES empresas(id),
  telefone    TEXT NOT NULL,
  descricao   TEXT,
  principal   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (lead_id, telefone)
);

CREATE INDEX idx_lead_telefones_lookup ON lead_telefones(empresa_id, telefone);

ALTER TABLE lead_telefones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lead_telefones_empresa" ON lead_telefones
  FOR ALL USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "lead_telefones_service" ON lead_telefones
  FOR ALL TO service_role USING (true);

-- Backfill: cria entradas em lead_telefones para todos os leads existentes
INSERT INTO lead_telefones (lead_id, empresa_id, telefone, principal)
SELECT id, empresa_id, telefone, TRUE
FROM leads
WHERE deleted_at IS NULL
ON CONFLICT (lead_id, telefone) DO NOTHING;

-- Backfill: vincula conversas existentes sem lead_id ao lead pelo telefone
UPDATE conversas c
SET lead_id = lt.lead_id
FROM lead_telefones lt
WHERE c.lead_id IS NULL
  AND c.contato_telefone IS NOT NULL
  AND c.empresa_id = lt.empresa_id
  AND c.contato_telefone = lt.telefone;
