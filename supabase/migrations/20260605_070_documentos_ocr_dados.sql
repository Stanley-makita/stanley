-- Campo JSONB para dados estruturados extraídos via OCR (RG, CNH, comprovante, etc.)
ALTER TABLE documentos_clientes ADD COLUMN IF NOT EXISTS ocr_dados JSONB;

-- Adiciona status 'revisado' (operacional confirmou os dados extraídos no CRM)
ALTER TABLE documentos_clientes
  DROP CONSTRAINT IF EXISTS documentos_clientes_ocr_status_check;

ALTER TABLE documentos_clientes
  ADD CONSTRAINT documentos_clientes_ocr_status_check
  CHECK (ocr_status IN ('pendente', 'processando', 'concluido', 'erro', 'ignorado', 'revisado'));
