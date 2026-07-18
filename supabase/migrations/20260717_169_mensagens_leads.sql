-- Central de Comunicação — Relacionamento de Comunicação (Entrega 1).
-- Equivalente de mensagens_processos para a jornada de Captação. Tabela própria,
-- não uma extensão de mensagens_processos com lead_id nullable — mantém uma FK
-- obrigatória real por tabela em vez de um contexto genérico compartilhado.
--
-- Mesmo mecanismo de idempotência: envio_id UNIQUE, INSERT atômico antes de
-- qualquer chamada à Uazapi.
CREATE TABLE IF NOT EXISTS mensagens_leads (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  lead_id     UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  -- Nulo até o envio à Uazapi confirmar e a linha em `mensagens` existir.
  mensagem_id UUID REFERENCES mensagens(id) ON DELETE SET NULL,
  envio_id    UUID NOT NULL UNIQUE,
  usuario_id  UUID NOT NULL REFERENCES usuarios(id),
  status      TEXT NOT NULL DEFAULT 'enviando' CHECK (status IN ('enviando', 'enviado', 'falhou')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_msg_lead_lead    ON mensagens_leads(lead_id);
CREATE INDEX IF NOT EXISTS idx_msg_lead_empresa ON mensagens_leads(empresa_id);

ALTER TABLE mensagens_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mensagens_leads_select" ON mensagens_leads;
CREATE POLICY "mensagens_leads_select" ON mensagens_leads
  FOR SELECT USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
  );

DROP POLICY IF EXISTS "mensagens_leads_insert" ON mensagens_leads;
CREATE POLICY "mensagens_leads_insert" ON mensagens_leads
  FOR INSERT WITH CHECK (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
  );

DROP POLICY IF EXISTS "mensagens_leads_update" ON mensagens_leads;
CREATE POLICY "mensagens_leads_update" ON mensagens_leads
  FOR UPDATE USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
  );

-- Service role bypass — o endpoint de envio roda com a chave de serviço, igual ao webhook.
DROP POLICY IF EXISTS "service_mensagens_leads_all" ON mensagens_leads;
CREATE POLICY "service_mensagens_leads_all" ON mensagens_leads
  FOR ALL USING (auth.role() = 'service_role');
