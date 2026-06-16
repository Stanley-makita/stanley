-- Migration: token de confirmação e campos de aceite em email_envios
ALTER TABLE email_envios
  ADD COLUMN IF NOT EXISTS token           UUID        NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS dados_json      JSONB,
  ADD COLUMN IF NOT EXISTS confirmado_em   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmado_valores    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS confirmado_variacoes  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS confirmado_prazos     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS confirmacao_ip         TEXT,
  ADD COLUMN IF NOT EXISTS confirmacao_user_agent TEXT,
  ADD COLUMN IF NOT EXISTS numero_protocolo       TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS email_envios_token_uidx ON email_envios(token);
