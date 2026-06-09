-- Tabela de auditoria de compartilhamentos de documentos via WhatsApp
CREATE TABLE IF NOT EXISTS documentos_compartilhamentos (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        UUID        NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  documento_id      UUID        NOT NULL REFERENCES documentos_clientes(id) ON DELETE CASCADE,
  telefone_destino  TEXT        NOT NULL,
  pessoa_id_destino UUID        REFERENCES pessoas(id) ON DELETE SET NULL,
  conversa_id       UUID        REFERENCES conversas(id) ON DELETE SET NULL,
  usuario_id        UUID        NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  mensagem          TEXT,
  enviado_em        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE documentos_compartilhamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "empresa_select" ON documentos_compartilhamentos
  FOR SELECT USING (
    empresa_id IN (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "empresa_insert" ON documentos_compartilhamentos
  FOR INSERT WITH CHECK (
    empresa_id IN (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid())
  );

CREATE INDEX idx_doc_compartilhamentos_empresa   ON documentos_compartilhamentos(empresa_id);
CREATE INDEX idx_doc_compartilhamentos_documento ON documentos_compartilhamentos(documento_id);
