-- Migration 066: Configuração do agente bot (Fonti)
-- Uma linha por empresa — valores editáveis pelo administrador no CRM

CREATE TABLE bot_config (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            UUID        NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome_agente           TEXT        NOT NULL DEFAULT 'Fonti',
  mensagem_sazonal      TEXT,
  horario_inicio        INT         NOT NULL DEFAULT 8  CHECK (horario_inicio BETWEEN 0 AND 23),
  horario_fim           INT         NOT NULL DEFAULT 18 CHECK (horario_fim    BETWEEN 1 AND 24),
  dias_atendimento      INT[]       NOT NULL DEFAULT '{1,2,3,4,5}',
  mensagem_fora_horario TEXT,
  produtos_ativos       TEXT[]      NOT NULL DEFAULT ARRAY['Financiamento Imobiliário','CGI','Consórcio','Contrato'],
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (empresa_id)
);

ALTER TABLE bot_config ENABLE ROW LEVEL SECURITY;

-- Admin/gerente da empresa gerencia; service role tem acesso total (webhook)
CREATE POLICY "bot_config_empresa" ON bot_config
  FOR ALL USING (
    empresa_id = (
      SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1
    )
  );

CREATE POLICY "bot_config_service" ON bot_config
  FOR ALL TO service_role USING (true);

CREATE TRIGGER bot_config_set_updated_at
  BEFORE UPDATE ON bot_config
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
