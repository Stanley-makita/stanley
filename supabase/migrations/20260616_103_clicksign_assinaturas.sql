-- =============================================================================
-- MIGRATION 103 — Colunas Clicksign em processo_contratos
-- =============================================================================

ALTER TABLE processo_contratos
  ADD COLUMN IF NOT EXISTS clicksign_envelope_id  TEXT,
  ADD COLUMN IF NOT EXISTS clicksign_document_id  TEXT,
  ADD COLUMN IF NOT EXISTS clicksign_status       TEXT,   -- draft | running | closed | cancelled
  ADD COLUMN IF NOT EXISTS clicksign_signed_url   TEXT,   -- URL do PDF assinado retornado pelo Clicksign
  ADD COLUMN IF NOT EXISTS clicksign_enviado_em   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS clicksign_assinado_em  TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_processo_contratos_clicksign_envelope
  ON processo_contratos (clicksign_envelope_id)
  WHERE clicksign_envelope_id IS NOT NULL;
