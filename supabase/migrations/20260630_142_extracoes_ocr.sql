-- ============================================================
-- Migration: 20260630_142_extracoes_ocr.sql
-- Sprint Inteligência Documental — Fase B (Histórico de OCR)
-- Cria o histórico de execuções de OCR (1:N por documento), substituindo
-- a ideia de sobrescrever documentos_clientes.ocr_dados a cada reprocessamento.
-- documentos_clientes.ocr_dados continua sendo escrito em paralelo (espelho)
-- até a Fase E — ver docs/arquitetura-documental-fonti.md.
-- ============================================================

CREATE TABLE extracoes_ocr (
  id                     UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id             UUID         NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  documento_id           UUID         NOT NULL REFERENCES documentos_clientes(id) ON DELETE CASCADE,
  provider               TEXT         NOT NULL,
  modelo                 TEXT,
  versao                 TEXT         NOT NULL DEFAULT 'v1',
  status                 TEXT         NOT NULL DEFAULT 'pendente'
                                      CHECK (status IN ('pendente', 'processando', 'concluido', 'erro', 'ignorado')),
  confianca              TEXT         CHECK (confianca IN ('alta', 'media', 'baixa')),
  dados                  JSONB,
  erro_mensagem          TEXT,
  solicitado_por         UUID         REFERENCES usuarios(id) ON DELETE SET NULL,
  executado_em           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  concluido_em           TIMESTAMPTZ,
  tempo_processamento_ms INTEGER,
  vigente                BOOLEAN      NOT NULL DEFAULT false
);

CREATE INDEX idx_extracoes_ocr_documento ON extracoes_ocr (documento_id, executado_em DESC);
CREATE INDEX idx_extracoes_ocr_empresa   ON extracoes_ocr (empresa_id);

-- No máximo uma extração vigente por documento
CREATE UNIQUE INDEX idx_extracoes_ocr_vigente ON extracoes_ocr (documento_id) WHERE vigente = true;

ALTER TABLE extracoes_ocr ENABLE ROW LEVEL SECURITY;

CREATE POLICY "extracoes_ocr_select" ON extracoes_ocr FOR SELECT
  USING (empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() AND ativo = true LIMIT 1));

-- Escrita feita pelo motor de OCR (service role) — sem policy de INSERT/UPDATE
-- para authenticated, igual ao padrão já usado em documentos_clientes.
CREATE POLICY "extracoes_ocr_service" ON extracoes_ocr FOR ALL TO service_role USING (true);
