-- Migration 071: Adiciona processo_id e pessoa_id em fonti_marcas
-- Necessário para o fluxo *fonti processo — vinculação de documentos a processos via WhatsApp

ALTER TABLE fonti_marcas
  ADD COLUMN IF NOT EXISTS processo_id UUID REFERENCES processos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pessoa_id   UUID REFERENCES pessoas(id)   ON DELETE SET NULL;
