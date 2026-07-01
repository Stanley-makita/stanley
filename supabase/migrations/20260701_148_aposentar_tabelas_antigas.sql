-- ============================================================
-- Migration: 20260701_148_aposentar_tabelas_antigas.sql
-- Sprint Inteligência Documental — Fase 4 (conclusão).
--
-- ⚠️ DESTRUTIVA — só rodar depois de validar manualmente todos os fluxos
-- migrados nas Fases 1-3 (upload/excluir/renomear/OCR/FGTS/compartilhar
-- em Lead, Processo, Consórcio, Pessoa; webhook do WhatsApp; comandos
-- *fonti; *cria cliente; geração de formulários).
--
-- Nenhum código da aplicação lê ou escreve mais em `documentos_clientes`,
-- `processo_documentos` ou `documento_processo_vinculos` (confirmado por
-- varredura completa do código-fonte nas Fases 1-3). O trigger de
-- sincronização (migration 146) também deixa de ter função, já que nada
-- mais escreve na tabela que ele observa.
-- ============================================================

BEGIN;

-- ── Repontar a última FK solta encontrada na varredura final ──────────────
-- checklist_execucoes.anexo_id guarda um id de documento (usado como valor
-- opaco pela aplicação, sem join) — apontava para documentos_clientes(id).
ALTER TABLE checklist_execucoes DROP CONSTRAINT IF EXISTS checklist_execucoes_anexo_id_fkey;

UPDATE checklist_execucoes ce
SET anexo_id = NULL
WHERE anexo_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM documentos d WHERE d.id = ce.anexo_id);

ALTER TABLE checklist_execucoes
  ADD CONSTRAINT checklist_execucoes_anexo_id_fkey
  FOREIGN KEY (anexo_id) REFERENCES documentos(id) ON DELETE SET NULL;

-- ── Remove o trigger de sincronização (migration 146) ──────────────────────
DROP TRIGGER IF EXISTS trg_sincronizar_documento_unificado ON documentos_clientes;
DROP FUNCTION IF EXISTS fn_sincronizar_documento_unificado();

-- ── Remove as tabelas antigas ───────────────────────────────────────────────
DROP TABLE IF EXISTS documento_processo_vinculos;
DROP TABLE IF EXISTS documentos_clientes;
DROP TABLE IF EXISTS processo_documentos;

COMMIT;
