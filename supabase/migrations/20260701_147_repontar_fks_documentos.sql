-- ============================================================
-- Migration: 20260701_147_repontar_fks_documentos.sql
-- Sprint Inteligência Documental — início da migração para o modelo definitivo.
-- O banco de dev será reinicializado ao final desta sprint, então não há mais
-- necessidade de manter `documentos_clientes` como fonte de verdade em paralelo.
-- Esta migration repoint as FKs que hoje apontam pra `documentos_clientes(id)`
-- para apontarem para `documentos(id)` — pré-requisito pra Fase 1 (migrar os
-- produtores) e Fase 3 (migrar o pipeline de OCR) desta sprint.
--
-- Linhas órfãs (que apontam pra documentos_clientes que nunca entraram em
-- `documentos` — resíduo conhecido da Fase D, ~106 documentos sem pessoa_id
-- resolvível) são limpas antes de recriar a constraint, porque são dado de
-- dev descartável e bloqueariam a validação da nova FK.
-- ============================================================

BEGIN;

-- ── extracoes_ocr.documento_id ────────────────────────────────────────────
ALTER TABLE extracoes_ocr DROP CONSTRAINT IF EXISTS extracoes_ocr_documento_id_fkey;

DELETE FROM extracoes_ocr eo
WHERE NOT EXISTS (SELECT 1 FROM documentos d WHERE d.id = eo.documento_id);

ALTER TABLE extracoes_ocr
  ADD CONSTRAINT extracoes_ocr_documento_id_fkey
  FOREIGN KEY (documento_id) REFERENCES documentos(id) ON DELETE CASCADE;

-- ── documentos_compartilhamentos.documento_id ─────────────────────────────
ALTER TABLE documentos_compartilhamentos DROP CONSTRAINT IF EXISTS documentos_compartilhamentos_documento_id_fkey;

DELETE FROM documentos_compartilhamentos dc
WHERE NOT EXISTS (SELECT 1 FROM documentos d WHERE d.id = dc.documento_id);

ALTER TABLE documentos_compartilhamentos
  ADD CONSTRAINT documentos_compartilhamentos_documento_id_fkey
  FOREIGN KEY (documento_id) REFERENCES documentos(id) ON DELETE CASCADE;

-- ── pessoa_documentos_identificacao.documento_cliente_id ──────────────────
-- Nullable e não é a chave da linha (só rastreabilidade) — em vez de apagar
-- a linha órfã, apenas perde a referência ao documento de origem.
ALTER TABLE pessoa_documentos_identificacao DROP CONSTRAINT IF EXISTS pessoa_documentos_identificacao_documento_cliente_id_fkey;

UPDATE pessoa_documentos_identificacao pdi
SET documento_cliente_id = NULL
WHERE documento_cliente_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos d WHERE d.id = pdi.documento_cliente_id);

ALTER TABLE pessoa_documentos_identificacao
  ADD CONSTRAINT pessoa_documentos_identificacao_documento_cliente_id_fkey
  FOREIGN KEY (documento_cliente_id) REFERENCES documentos(id);

COMMIT;
