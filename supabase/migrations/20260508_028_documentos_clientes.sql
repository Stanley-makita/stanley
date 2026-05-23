-- Migration: documentos_clientes — captura automática de arquivos recebidos
-- Objetivo: salvar PDFs, imagens e documentos enviados por clientes via WhatsApp
-- sem depender de download manual. Preparado para OCR/IA futuro, mas não implementa agora.

CREATE TABLE documentos_clientes (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id       UUID        NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,

  -- Rastreabilidade de origem (ao menos conversa_id ou pessoa_id deve ser preenchido)
  conversa_id      UUID        REFERENCES conversas(id)  ON DELETE SET NULL,
  pessoa_id        UUID        REFERENCES pessoas(id)    ON DELETE SET NULL,
  lead_id          UUID        REFERENCES leads(id)      ON DELETE SET NULL,
  processo_id      UUID        REFERENCES processos(id)  ON DELETE SET NULL,

  -- Metadata do arquivo
  nome_original    TEXT        NOT NULL,
  mime_type        TEXT,
  tamanho_bytes    BIGINT,
  storage_bucket   TEXT        NOT NULL DEFAULT 'documentos-clientes',
  storage_path     TEXT        NOT NULL,
  canal_origem     TEXT        NOT NULL DEFAULT 'whatsapp'
    CHECK (canal_origem IN ('whatsapp', 'upload_manual', 'email', 'outros')),

  -- Processamento futuro (OCR, classificação por IA)
  classificacao    TEXT,
  ocr_status       TEXT        NOT NULL DEFAULT 'pendente'
    CHECK (ocr_status IN ('pendente', 'processando', 'concluido', 'erro', 'ignorado')),
  ocr_texto        TEXT,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ
);

-- Índices por entidade (para exibir documentos em cada tela)
CREATE INDEX idx_doc_cli_empresa   ON documentos_clientes(empresa_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_doc_cli_pessoa    ON documentos_clientes(pessoa_id)   WHERE pessoa_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_doc_cli_conversa  ON documentos_clientes(conversa_id) WHERE conversa_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_doc_cli_lead      ON documentos_clientes(lead_id)     WHERE lead_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_doc_cli_processo  ON documentos_clientes(processo_id) WHERE processo_id IS NOT NULL AND deleted_at IS NULL;

CREATE TRIGGER doc_cli_set_updated_at
  BEFORE UPDATE ON documentos_clientes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS
ALTER TABLE documentos_clientes ENABLE ROW LEVEL SECURITY;

-- Membros ativos da empresa veem todos os documentos
CREATE POLICY "doc_cli_select" ON documentos_clientes FOR SELECT
  USING (empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() AND ativo = true LIMIT 1));

-- Membros ativos podem inserir (webhook usa service_role)
CREATE POLICY "doc_cli_insert" ON documentos_clientes FOR INSERT
  WITH CHECK (empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() AND ativo = true LIMIT 1));

-- Membros ativos podem soft-delete (updated_at + deleted_at)
CREATE POLICY "doc_cli_update" ON documentos_clientes FOR UPDATE
  USING (empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() AND ativo = true LIMIT 1));

-- Service role (webhook auto-save)
CREATE POLICY "doc_cli_service" ON documentos_clientes FOR ALL TO service_role USING (true);

-- Realtime (para exibir documentos recebidos em tempo real)
ALTER PUBLICATION supabase_realtime ADD TABLE documentos_clientes;

-- Nota: criar o bucket "documentos-clientes" manualmente no Supabase Dashboard
-- Configuração: Private bucket
-- Storage policies: usar empresa_id como primeiro segmento do path (empresa_id/conversa_id/uuid.ext)
