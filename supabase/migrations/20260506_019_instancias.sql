-- Tabela de instâncias WhatsApp (uma por número/atendente)
CREATE TABLE IF NOT EXISTS instancias (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome            TEXT NOT NULL,           -- ex: "WhatsApp Marcio"
  token           TEXT NOT NULL UNIQUE,    -- UAZAPI_INSTANCE_TOKEN
  numero_telefone TEXT,                    -- ex: "5544999990000"
  atendente_id    UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  ativo           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_instancias_empresa   ON instancias(empresa_id);
CREATE INDEX IF NOT EXISTS idx_instancias_token     ON instancias(token);
CREATE INDEX IF NOT EXISTS idx_instancias_atendente ON instancias(atendente_id) WHERE atendente_id IS NOT NULL;

ALTER TABLE instancias ENABLE ROW LEVEL SECURITY;

-- Membros da empresa podem ver/gerenciar instâncias da própria empresa
CREATE POLICY "instancias_select" ON instancias
  FOR SELECT USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
  );

CREATE POLICY "instancias_insert" ON instancias
  FOR INSERT WITH CHECK (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
  );

CREATE POLICY "instancias_update" ON instancias
  FOR UPDATE USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
  );

-- Service role bypass para o webhook
CREATE POLICY "service_instancias_all" ON instancias
  FOR ALL USING (auth.role() = 'service_role');
