-- Tabela de conversas (uma por canal+contato por empresa)
CREATE TABLE IF NOT EXISTS conversas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  canal         TEXT NOT NULL CHECK (canal IN ('whatsapp', 'site', 'instagram', 'outros')),
  contato_telefone TEXT,
  contato_nome  TEXT,
  lead_id       UUID REFERENCES leads(id) ON DELETE SET NULL,
  status        TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'qualificado', 'encerrado', 'humano')),
  bot_ativo     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices conversas
CREATE INDEX IF NOT EXISTS idx_conversas_empresa_status   ON conversas(empresa_id, status);
CREATE INDEX IF NOT EXISTS idx_conversas_empresa_canal    ON conversas(empresa_id, canal);
CREATE INDEX IF NOT EXISTS idx_conversas_telefone         ON conversas(empresa_id, contato_telefone) WHERE contato_telefone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversas_lead             ON conversas(lead_id) WHERE lead_id IS NOT NULL;

-- Tabela de mensagens
CREATE TABLE IF NOT EXISTS mensagens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id   UUID NOT NULL REFERENCES conversas(id) ON DELETE CASCADE,
  origem        TEXT NOT NULL CHECK (origem IN ('cliente', 'bot', 'humano')),
  conteudo      TEXT NOT NULL,
  metadata      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice mensagens
CREATE INDEX IF NOT EXISTS idx_mensagens_conversa_created ON mensagens(conversa_id, created_at);

-- RLS
ALTER TABLE conversas  ENABLE ROW LEVEL SECURITY;
ALTER TABLE mensagens  ENABLE ROW LEVEL SECURITY;

-- Políticas conversas
CREATE POLICY "empresa_conversas_select" ON conversas
  FOR SELECT USING (empresa_id = (
    SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1
  ));

CREATE POLICY "empresa_conversas_insert" ON conversas
  FOR INSERT WITH CHECK (empresa_id = (
    SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1
  ));

CREATE POLICY "empresa_conversas_update" ON conversas
  FOR UPDATE USING (empresa_id = (
    SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1
  ));

-- Políticas mensagens (via conversa)
CREATE POLICY "empresa_mensagens_select" ON mensagens
  FOR SELECT USING (
    conversa_id IN (
      SELECT id FROM conversas WHERE empresa_id = (
        SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1
      )
    )
  );

CREATE POLICY "empresa_mensagens_insert" ON mensagens
  FOR INSERT WITH CHECK (
    conversa_id IN (
      SELECT id FROM conversas WHERE empresa_id = (
        SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1
      )
    )
  );

-- Trigger updated_at em conversas
CREATE OR REPLACE FUNCTION update_conversas_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_conversas_updated_at
  BEFORE UPDATE ON conversas
  FOR EACH ROW EXECUTE FUNCTION update_conversas_updated_at();

-- Service role bypass (para o webhook do bot — sem auth de usuário)
CREATE POLICY "service_conversas_all" ON conversas
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service_mensagens_all" ON mensagens
  FOR ALL USING (auth.role() = 'service_role');
