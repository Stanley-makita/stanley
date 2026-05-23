-- Migration: sla_config_operacional — configuração de SLA por tipo de solicitação
-- Admins podem ajustar os SLAs de cada tipo. Defaults conservadores abaixo.

CREATE TABLE sla_config_operacional (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID        NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  tipo        tipo_solicitacao NOT NULL,
  horas_sla   INTEGER     NOT NULL DEFAULT 24 CHECK (horas_sla > 0),
  ativo       BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, tipo)
);

ALTER TABLE sla_config_operacional ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER sla_cfg_updated_at
  BEFORE UPDATE ON sla_config_operacional
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Todos da empresa veem a config
CREATE POLICY "sla_cfg_select" ON sla_config_operacional FOR SELECT
  USING (empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1));

-- Só admin escreve
CREATE POLICY "sla_cfg_write" ON sla_config_operacional FOR ALL
  USING ((SELECT perfil FROM usuarios WHERE auth_user_id = auth.uid()) = 'admin');

CREATE POLICY "sla_cfg_service" ON sla_config_operacional FOR ALL TO service_role USING (true);

-- Seed com defaults para todas as empresas existentes
-- simulacao=4h, pendencia/atendimento=4-12h, analise=24h, engenharia/registro=72h
INSERT INTO sla_config_operacional (empresa_id, tipo, horas_sla)
SELECT e.id, t.tipo::tipo_solicitacao, t.h
FROM empresas e
CROSS JOIN (VALUES
  ('simulacao',4),
  ('analise_credito',24),
  ('reanalise',48),
  ('engenharia',72),
  ('custas',24),
  ('documentos',24),
  ('formalizacao',48),
  ('registro',72),
  ('pendencia',12),
  ('atendimento_cliente',4),
  ('outros',24)
) AS t(tipo, h)
ON CONFLICT (empresa_id, tipo) DO NOTHING;
