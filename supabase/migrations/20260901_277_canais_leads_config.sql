-- Controle por empresa de quais canais de captação de leads estão ativos.
-- Motivação: formulário do site recebendo spam recorrente; Instagram (em
-- análise no Meta) e futuros canais podem ter o mesmo problema — o usuário
-- precisa poder desligar um canal específico sem mexer em código/webhook.
-- Todas as colunas default true (nenhum canal existente muda de comportamento
-- até o usuário desativar algo manualmente em Configurações).

CREATE TABLE canais_leads_config (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  site_ativo     BOOLEAN NOT NULL DEFAULT TRUE,
  instagram_ativo BOOLEAN NOT NULL DEFAULT TRUE,
  indicacao_ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (empresa_id)
);

ALTER TABLE canais_leads_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "canais_leads_config_empresa" ON canais_leads_config
  FOR ALL USING (empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1));

CREATE POLICY "canais_leads_config_service" ON canais_leads_config
  FOR ALL TO service_role USING (true);

CREATE TRIGGER canais_leads_config_set_updated_at BEFORE UPDATE ON canais_leads_config
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
