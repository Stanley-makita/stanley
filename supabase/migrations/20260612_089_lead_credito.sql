-- ============================================================
-- Migration 089: Módulo de Crédito no Lead
-- Adiciona campos de análise de crédito, dados da operação
-- e tabelas de vinculação de parceiros ao Lead
-- ============================================================

-- 1. Novos campos na tabela leads
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS banco_pretendido   TEXT,
  ADD COLUMN IF NOT EXISTS valor_imovel       NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS entrada            NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS prazo_meses        INTEGER,
  ADD COLUMN IF NOT EXISTS finalidade         TEXT,
  ADD COLUMN IF NOT EXISTS tipo_imovel        TEXT,
  ADD COLUMN IF NOT EXISTS cidade_imovel      TEXT,
  ADD COLUMN IF NOT EXISTS renda_considerada  NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS status_analise     TEXT NOT NULL DEFAULT 'aguardando_documentos';

ALTER TABLE leads
  ADD CONSTRAINT chk_lead_status_analise CHECK (
    status_analise IN (
      'aguardando_documentos', 'documentacao_recebida', 'em_simulacao',
      'em_analise_credito', 'pre_aprovado', 'aprovado', 'reprovado', 'convertido_em_processo'
    )
  ),
  ADD CONSTRAINT chk_lead_finalidade CHECK (
    finalidade IS NULL OR finalidade IN ('residencial', 'comercial', 'investimento', 'reforma')
  ),
  ADD CONSTRAINT chk_lead_tipo_imovel CHECK (
    tipo_imovel IS NULL OR tipo_imovel IN ('apartamento', 'casa', 'terreno', 'comercial', 'rural')
  );

-- 2. Expandir enum lead_origem com novos valores
ALTER TYPE lead_origem ADD VALUE IF NOT EXISTS 'direto';
ALTER TYPE lead_origem ADD VALUE IF NOT EXISTS 'corretor';
ALTER TYPE lead_origem ADD VALUE IF NOT EXISTS 'imobiliaria';
ALTER TYPE lead_origem ADD VALUE IF NOT EXISTS 'construtora';
ALTER TYPE lead_origem ADD VALUE IF NOT EXISTS 'parceiro_comercial';

-- 3. Tabela: lead_corretores
CREATE TABLE IF NOT EXISTS lead_corretores (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  corretor_id UUID NOT NULL REFERENCES corretores(id) ON DELETE RESTRICT,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (lead_id, corretor_id)
);

CREATE INDEX IF NOT EXISTS idx_lead_corretores_lead     ON lead_corretores(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_corretores_corretor ON lead_corretores(corretor_id);

-- 4. Tabela: lead_imobiliarias
CREATE TABLE IF NOT EXISTS lead_imobiliarias (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id        UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  imobiliaria_id UUID NOT NULL REFERENCES imobiliarias(id) ON DELETE RESTRICT,
  papel          TEXT NOT NULL DEFAULT 'imobiliaria'
                   CHECK (papel IN ('imobiliaria', 'construtora')),
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (lead_id, imobiliaria_id, papel)
);

CREATE INDEX IF NOT EXISTS idx_lead_imobiliarias_lead        ON lead_imobiliarias(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_imobiliarias_imobiliaria ON lead_imobiliarias(imobiliaria_id);

-- 5. Tabela: lead_parceiros
CREATE TABLE IF NOT EXISTS lead_parceiros (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  parceiro_id UUID NOT NULL REFERENCES parceiros(id) ON DELETE RESTRICT,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (lead_id, parceiro_id)
);

CREATE INDEX IF NOT EXISTS idx_lead_parceiros_lead     ON lead_parceiros(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_parceiros_parceiro ON lead_parceiros(parceiro_id);

-- 6. RLS
ALTER TABLE lead_corretores   ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_imobiliarias ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_parceiros    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "autenticados leem lead_corretores"
  ON lead_corretores FOR SELECT TO authenticated USING (true);
CREATE POLICY "autenticados escrevem lead_corretores"
  ON lead_corretores FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "autenticados leem lead_imobiliarias"
  ON lead_imobiliarias FOR SELECT TO authenticated USING (true);
CREATE POLICY "autenticados escrevem lead_imobiliarias"
  ON lead_imobiliarias FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "autenticados leem lead_parceiros"
  ON lead_parceiros FOR SELECT TO authenticated USING (true);
CREATE POLICY "autenticados escrevem lead_parceiros"
  ON lead_parceiros FOR ALL TO authenticated USING (true) WITH CHECK (true);
