-- Simulador de Custas: tabelas de configuração e histórico de simulações

-- Configuração geral do simulador (parâmetros editáveis)
CREATE TABLE IF NOT EXISTS simulador_config_geral (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID        NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  chave       TEXT        NOT NULL,
  valor       NUMERIC(14,6) NOT NULL,
  descricao   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, chave)
);

-- Configuração de tarifas bancárias por banco
CREATE TABLE IF NOT EXISTS simulador_custas_config (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            UUID        NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  banco_id              UUID        REFERENCES bancos(id) ON DELETE SET NULL,
  banco_nome            TEXT        NOT NULL,
  tarifa_avaliacao      NUMERIC(12,2) NOT NULL DEFAULT 0,
  tarifa_correspondente NUMERIC(12,2) NOT NULL DEFAULT 0,
  tarifa_outros         NUMERIC(12,2) NOT NULL DEFAULT 0,
  ativo                 BOOLEAN     NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Configuração de alíquotas de ITBI por município
CREATE TABLE IF NOT EXISTS simulador_itbi_config (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        UUID        NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  municipio         TEXT        NOT NULL,
  aliquota          NUMERIC(6,4) NOT NULL,  -- ex: 0.03 = 3%
  tem_desconto      BOOLEAN     NOT NULL DEFAULT false,
  aliquota_desconto NUMERIC(6,4),           -- alíquota com desconto (se houver)
  limite_desconto   NUMERIC(14,2),          -- valor máximo do imóvel p/ desconto
  ativo             BOOLEAN     NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, municipio)
);

-- Histórico de simulações por processo ou lead
CREATE TABLE IF NOT EXISTS processo_custas_simulacoes (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID        NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  processo_id     UUID        REFERENCES processos(id) ON DELETE SET NULL,
  lead_id         UUID        REFERENCES leads(id) ON DELETE SET NULL,
  criado_por      UUID        REFERENCES auth.users(id),
  -- Entradas
  valor_imovel    NUMERIC(14,2) NOT NULL,
  valor_financiado NUMERIC(14,2) NOT NULL,
  banco_nome      TEXT        NOT NULL,
  municipio       TEXT        NOT NULL,
  tem_desconto_itbi BOOLEAN   NOT NULL DEFAULT false,
  -- Resultados (snapshot)
  resultado_json  JSONB       NOT NULL,
  total_custas    NUMERIC(14,2) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sim_processo ON processo_custas_simulacoes(processo_id);
CREATE INDEX IF NOT EXISTS idx_sim_lead     ON processo_custas_simulacoes(lead_id);
CREATE INDEX IF NOT EXISTS idx_sim_empresa  ON processo_custas_simulacoes(empresa_id);

-- RLS
ALTER TABLE simulador_config_geral    ENABLE ROW LEVEL SECURITY;
ALTER TABLE simulador_custas_config   ENABLE ROW LEVEL SECURITY;
ALTER TABLE simulador_itbi_config     ENABLE ROW LEVEL SECURITY;
ALTER TABLE processo_custas_simulacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "scg_select" ON simulador_config_geral;
DROP POLICY IF EXISTS "scg_insert" ON simulador_config_geral;
DROP POLICY IF EXISTS "scg_update" ON simulador_config_geral;

CREATE POLICY "scg_select" ON simulador_config_geral    FOR SELECT USING (empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid()));
CREATE POLICY "scg_insert" ON simulador_config_geral    FOR INSERT WITH CHECK (empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid()));
CREATE POLICY "scg_update" ON simulador_config_geral    FOR UPDATE USING (empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid()));

DROP POLICY IF EXISTS "scc_select" ON simulador_custas_config;
DROP POLICY IF EXISTS "scc_insert" ON simulador_custas_config;
DROP POLICY IF EXISTS "scc_update" ON simulador_custas_config;

CREATE POLICY "scc_select" ON simulador_custas_config   FOR SELECT USING (empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid()));
CREATE POLICY "scc_insert" ON simulador_custas_config   FOR INSERT WITH CHECK (empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid()));
CREATE POLICY "scc_update" ON simulador_custas_config   FOR UPDATE USING (empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid()));

DROP POLICY IF EXISTS "sic_select" ON simulador_itbi_config;
DROP POLICY IF EXISTS "sic_insert" ON simulador_itbi_config;
DROP POLICY IF EXISTS "sic_update" ON simulador_itbi_config;

CREATE POLICY "sic_select" ON simulador_itbi_config     FOR SELECT USING (empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid()));
CREATE POLICY "sic_insert" ON simulador_itbi_config     FOR INSERT WITH CHECK (empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid()));
CREATE POLICY "sic_update" ON simulador_itbi_config     FOR UPDATE USING (empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid()));

DROP POLICY IF EXISTS "pcs_select" ON processo_custas_simulacoes;
DROP POLICY IF EXISTS "pcs_insert" ON processo_custas_simulacoes;

CREATE POLICY "pcs_select" ON processo_custas_simulacoes FOR SELECT USING (empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid()));
CREATE POLICY "pcs_insert" ON processo_custas_simulacoes FOR INSERT WITH CHECK (empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid()));

-- Seed: parâmetros padrão (FunRejus, IOF, Registro)
-- Estes serão inseridos via aplicação pois precisam do empresa_id
-- As tabelas ficam vazias até o primeiro acesso; a aplicação usa defaults hardcoded como fallback
