-- Migration 065: Substituição do módulo de Parceiros
-- Remove implementação simples (migration 064) e aplica o esquema completo

-- ============================================================
-- PARTE A: Limpar implementação anterior
-- ============================================================
DROP TABLE IF EXISTS processo_corretores CASCADE;
ALTER TABLE processos DROP COLUMN IF EXISTS imobiliaria_id;

-- ============================================================
-- PARTE B: Migration 049 — Empresas, Corretores, Parceiros
-- ============================================================

-- 1. EMPRESAS (imobiliárias + construtoras)
CREATE TABLE IF NOT EXISTS empresas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome          TEXT NOT NULL,
  telefone      TEXT,
  email         TEXT,
  cnpj          TEXT,
  tipo          TEXT NOT NULL CHECK (tipo IN ('imobiliaria', 'construtora', 'ambos')),
  observacao    TEXT,
  ativo         BOOLEAN NOT NULL DEFAULT true,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_empresas_tipo  ON empresas(tipo);
CREATE INDEX idx_empresas_ativo ON empresas(ativo);

-- 2. CORRETORES
CREATE TABLE IF NOT EXISTS corretores (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome          TEXT NOT NULL,
  telefone      TEXT,
  email         TEXT,
  creci         TEXT,
  empresa_id    UUID REFERENCES empresas(id) ON DELETE SET NULL,
  observacao    TEXT,
  ativo         BOOLEAN NOT NULL DEFAULT true,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_corretores_empresa ON corretores(empresa_id);
CREATE INDEX idx_corretores_ativo   ON corretores(ativo);

-- 3. PARCEIROS COMERCIAIS (PF ou PJ, comissionados)
CREATE TABLE IF NOT EXISTS parceiros (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome          TEXT NOT NULL,
  telefone      TEXT,
  email         TEXT,
  tipo          TEXT NOT NULL CHECK (tipo IN ('pessoa_fisica', 'empresa')),
  cpf_cnpj      TEXT,
  observacao    TEXT,
  ativo         BOOLEAN NOT NULL DEFAULT true,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_parceiros_tipo  ON parceiros(tipo);
CREATE INDEX idx_parceiros_ativo ON parceiros(ativo);

-- 4. VÍNCULO: PROCESSO ↔ EMPRESAS
CREATE TABLE IF NOT EXISTS processo_empresas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  processo_id UUID NOT NULL REFERENCES processos(id) ON DELETE CASCADE,
  empresa_id  UUID NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
  papel       TEXT NOT NULL CHECK (papel IN ('imobiliaria', 'construtora', 'vendedora')),
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (processo_id, empresa_id, papel)
);

CREATE INDEX idx_processo_empresas_processo ON processo_empresas(processo_id);
CREATE INDEX idx_processo_empresas_empresa  ON processo_empresas(empresa_id);

-- 5. VÍNCULO: PROCESSO ↔ CORRETORES
CREATE TABLE IF NOT EXISTS processo_corretores (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  processo_id  UUID NOT NULL REFERENCES processos(id) ON DELETE CASCADE,
  corretor_id  UUID NOT NULL REFERENCES corretores(id) ON DELETE RESTRICT,
  papel        TEXT NOT NULL CHECK (papel IN ('corretor_comprador', 'corretor_vendedor', 'corretor_parceiro')),
  principal    BOOLEAN NOT NULL DEFAULT false,
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (processo_id, corretor_id, papel)
);

CREATE INDEX idx_processo_corretores_processo ON processo_corretores(processo_id);
CREATE INDEX idx_processo_corretores_corretor ON processo_corretores(corretor_id);

-- 6. VÍNCULO: PROCESSO ↔ PARCEIROS COMERCIAIS
CREATE TABLE IF NOT EXISTS processo_parceiros (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  processo_id UUID NOT NULL REFERENCES processos(id) ON DELETE CASCADE,
  parceiro_id UUID NOT NULL REFERENCES parceiros(id) ON DELETE RESTRICT,
  observacao  TEXT,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (processo_id, parceiro_id)
);

CREATE INDEX idx_processo_parceiros_processo ON processo_parceiros(processo_id);
CREATE INDEX idx_processo_parceiros_parceiro ON processo_parceiros(parceiro_id);

-- 7. TRIGGERS de atualizado_em
CREATE OR REPLACE FUNCTION set_atualizado_em()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_empresas_atualizado_em
  BEFORE UPDATE ON empresas
  FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

CREATE TRIGGER trg_corretores_atualizado_em
  BEFORE UPDATE ON corretores
  FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

CREATE TRIGGER trg_parceiros_atualizado_em
  BEFORE UPDATE ON parceiros
  FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

-- 8. RLS
ALTER TABLE empresas            ENABLE ROW LEVEL SECURITY;
ALTER TABLE corretores          ENABLE ROW LEVEL SECURITY;
ALTER TABLE parceiros           ENABLE ROW LEVEL SECURITY;
ALTER TABLE processo_empresas   ENABLE ROW LEVEL SECURITY;
ALTER TABLE processo_corretores ENABLE ROW LEVEL SECURITY;
ALTER TABLE processo_parceiros  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "autenticados leem empresas"           ON empresas           FOR SELECT TO authenticated USING (true);
CREATE POLICY "autenticados leem corretores"         ON corretores         FOR SELECT TO authenticated USING (true);
CREATE POLICY "autenticados leem parceiros"          ON parceiros          FOR SELECT TO authenticated USING (true);
CREATE POLICY "autenticados leem processo_empresas"  ON processo_empresas  FOR SELECT TO authenticated USING (true);
CREATE POLICY "autenticados leem processo_corretores" ON processo_corretores FOR SELECT TO authenticated USING (true);
CREATE POLICY "autenticados leem processo_parceiros" ON processo_parceiros  FOR SELECT TO authenticated USING (true);

CREATE POLICY "admin gestor escrevem empresas"           ON empresas           FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "admin gestor escrevem corretores"         ON corretores         FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "admin gestor escrevem parceiros"          ON parceiros          FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "autenticados escrevem processo_empresas"  ON processo_empresas  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "autenticados escrevem processo_corretores" ON processo_corretores FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "autenticados escrevem processo_parceiros" ON processo_parceiros  FOR ALL TO authenticated USING (true) WITH CHECK (true);
