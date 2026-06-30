-- ============================================================
-- Migration: 20260630_143_extracoes_ocr_validacao.sql
-- Sprint Inteligência Documental — Fase C (Validação)
-- Acrescenta a camada de validação humana sobre a extração vigente:
-- Documento → OCR (bruto) → Validação Operacional → Dados Oficiais.
-- Ver docs/arquitetura-documental-fonti.md, seção 1.3 e 1.6.2.
-- ============================================================

ALTER TABLE extracoes_ocr
  ADD COLUMN validado_em     TIMESTAMPTZ,
  ADD COLUMN validado_por    UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  ADD COLUMN dados_validados JSONB;

CREATE INDEX idx_extracoes_ocr_validado ON extracoes_ocr (documento_id) WHERE validado_em IS NOT NULL;
