-- ============================================================
-- Migration 138: Status, data de resposta e banco definido
-- Incrementa lead_analises_credito com campos de acompanhamento
-- ============================================================

ALTER TABLE lead_analises_credito
  ADD COLUMN IF NOT EXISTS status        TEXT    NOT NULL DEFAULT 'em_analise'
    CHECK (status IN ('em_analise', 'aprovado', 'recusado', 'pendente')),
  ADD COLUMN IF NOT EXISTS data_resposta DATE,
  ADD COLUMN IF NOT EXISTS banco_definido BOOLEAN NOT NULL DEFAULT false;

-- Índice parcial para localizar rapidamente o banco definido de cada lead
CREATE INDEX IF NOT EXISTS idx_lead_analises_banco_definido
  ON lead_analises_credito(lead_id)
  WHERE banco_definido = true;
