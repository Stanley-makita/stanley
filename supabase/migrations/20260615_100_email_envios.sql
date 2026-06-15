-- Migration: email_envios — histórico de e-mails enviados pelo CRM
-- Registra cada e-mail enviado com status, template usado e rastreabilidade por empresa/processo

CREATE TABLE IF NOT EXISTS email_envios (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   UUID        NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  processo_id  UUID        REFERENCES processos(id) ON DELETE SET NULL,
  lead_id      UUID        REFERENCES leads(id)     ON DELETE SET NULL,
  pessoa_id    UUID        REFERENCES pessoas(id)   ON DELETE SET NULL,
  usuario_id   UUID        REFERENCES usuarios(id)  ON DELETE SET NULL,
  para_email   TEXT        NOT NULL,
  assunto      TEXT        NOT NULL,
  corpo        TEXT        NOT NULL,
  template     TEXT        NOT NULL,
  status       TEXT        NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'enviado', 'erro')),
  erro         TEXT,
  sent_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_envios_empresa    ON email_envios(empresa_id, created_at DESC);
CREATE INDEX idx_email_envios_processo   ON email_envios(processo_id) WHERE processo_id IS NOT NULL;
CREATE INDEX idx_email_envios_usuario    ON email_envios(usuario_id)  WHERE usuario_id IS NOT NULL;

-- RLS: usuários só acessam registros da própria empresa
ALTER TABLE email_envios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "email_envios_select" ON email_envios FOR SELECT
  USING (empresa_id = (
    SELECT empresa_id FROM usuarios
    WHERE auth_user_id = auth.uid() AND ativo = true
    LIMIT 1
  ));

CREATE POLICY "email_envios_insert" ON email_envios FOR INSERT
  WITH CHECK (empresa_id = (
    SELECT empresa_id FROM usuarios
    WHERE auth_user_id = auth.uid() AND ativo = true
    LIMIT 1
  ));

CREATE POLICY "email_envios_update" ON email_envios FOR UPDATE
  USING (empresa_id = (
    SELECT empresa_id FROM usuarios
    WHERE auth_user_id = auth.uid() AND ativo = true
    LIMIT 1
  ));

-- Service role para uso em API routes com service_role key
CREATE POLICY "email_envios_service" ON email_envios FOR ALL TO service_role USING (true);
