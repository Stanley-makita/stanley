-- Migration 081: candidatos_pendentes em fonti_marcas
-- Armazena temporariamente os candidatos de uma busca ambígua
-- para que o comercial possa escolher pelo número sem ver IDs internos.

ALTER TABLE fonti_marcas
  ADD COLUMN IF NOT EXISTS candidatos_pendentes jsonb;
