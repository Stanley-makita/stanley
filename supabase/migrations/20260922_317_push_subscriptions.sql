-- Migration 317 — push_subscriptions: inscrições de Web Push por usuário.
--
-- Fase 2 do plano de notificações push/PWA (2026-09-22). Um usuário pode ter
-- várias inscrições (celular, notebook, computador da empresa, outro
-- celular) — cada linha é um "dispositivo" independente. Uma inscrição
-- inválida (o navegador devolveu 404/410 ao tentar enviar) é desativada
-- (ativo=false), nunca apagada — mantém histórico e não afeta as demais.
--
-- Modelo copiado do padrão mais simples já usado em `processo_alertas_lidos`
-- (migration 20260619_105_validades_processo.sql) — tabela de posse única
-- (usuario_id), uma política só FOR ALL, sem a separação por operação que
-- `notificacoes` tem (lá o INSERT é bloqueado pra forçar passar por RPC;
-- aqui o próprio usuário gerencia as próprias inscrições direto do client,
-- então não há razão pra restringir).

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id    UUID        NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  endpoint      TEXT        NOT NULL,
  p256dh        TEXT        NOT NULL,
  auth          TEXT        NOT NULL,
  user_agent    TEXT,
  ativo         BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at  TIMESTAMPTZ,
  UNIQUE (endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_usuario_ativo
  ON push_subscriptions(usuario_id) WHERE ativo = true;

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "usuario gerencia proprias inscricoes de push" ON push_subscriptions
  FOR ALL
  USING (usuario_id = auth.uid())
  WITH CHECK (usuario_id = auth.uid());

-- A rota de envio (server-side, service_role) precisa ler/atualizar
-- inscrições de QUALQUER usuário (é ela quem decide pra quem mandar,
-- baseada em usuario_id da notificação, não em quem está logado no
-- momento) — service_role já ignora RLS por padrão, então nenhuma policy
-- adicional é necessária pra isso.

-- set_updated_at() já existe (definida em várias migrations anteriores via
-- CREATE OR REPLACE, ex. 20260415_004_leads.sql) — reaproveitada aqui, sem
-- criar uma função nova só pra esta tabela.
CREATE TRIGGER trg_push_subscriptions_updated_at
  BEFORE UPDATE ON push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
