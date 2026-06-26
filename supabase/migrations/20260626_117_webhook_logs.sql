-- Migration 117: Tabela de auditoria de webhooks
-- Registra todas as chamadas recebidas de sistemas externos (N8N, Facebook, etc.)
-- com payload original, resultado e vínculos criados.

CREATE TABLE IF NOT EXISTS webhook_logs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID        REFERENCES empresas(id),
  endpoint      TEXT        NOT NULL,
  payload       JSONB,
  status        TEXT        CHECK (status IN ('processando', 'sucesso', 'erro', 'ignorado')),
  erro_mensagem TEXT,
  lead_id       UUID        REFERENCES leads(id),
  parceiro_id   UUID        REFERENCES parceiros(id),
  processado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_logs_empresa
  ON webhook_logs(empresa_id, processado_em DESC);

CREATE INDEX IF NOT EXISTS idx_webhook_logs_status
  ON webhook_logs(status, processado_em DESC);
