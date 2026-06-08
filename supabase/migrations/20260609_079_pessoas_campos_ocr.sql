-- Adiciona campos extraídos por OCR que faltavam na tabela pessoas
ALTER TABLE pessoas
  ADD COLUMN IF NOT EXISTS orgao_emissor  TEXT,
  ADD COLUMN IF NOT EXISTS filiacao_mae   TEXT,
  ADD COLUMN IF NOT EXISTS filiacao_pai   TEXT;
