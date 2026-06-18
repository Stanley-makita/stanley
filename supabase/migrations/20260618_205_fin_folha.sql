-- Migration 205: financeiro_folhas + financeiro_folha_itens

-- Enums
DO $$ BEGIN
  CREATE TYPE fin_status_folha AS ENUM ('rascunho', 'fechada', 'paga');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE fin_status_pagamento_item AS ENUM ('pendente', 'pago', 'suspenso');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Folha Mensal
CREATE TABLE IF NOT EXISTS financeiro_folhas (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  fechamento_id         UUID REFERENCES financeiro_fechamentos(id) ON DELETE SET NULL,
  competencia_mes       INTEGER NOT NULL CHECK (competencia_mes BETWEEN 1 AND 12),
  competencia_ano       INTEGER NOT NULL CHECK (competencia_ano BETWEEN 2020 AND 2100),
  status                fin_status_folha NOT NULL DEFAULT 'rascunho',
  total_salarios        NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_beneficios      NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_comissoes       NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_descontos       NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_liquido         NUMERIC(15,2) NOT NULL DEFAULT 0,
  observacoes           TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_folha_competencia UNIQUE (empresa_id, competencia_ano, competencia_mes)
);

CREATE INDEX IF NOT EXISTS idx_fin_folhas_empresa ON financeiro_folhas(empresa_id);
CREATE INDEX IF NOT EXISTS idx_fin_folhas_fechamento ON financeiro_folhas(fechamento_id);

CREATE OR REPLACE TRIGGER trg_fin_folhas_updated_at
  BEFORE UPDATE ON financeiro_folhas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Itens por Funcionário
CREATE TABLE IF NOT EXISTS financeiro_folha_itens (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  folha_id              UUID NOT NULL REFERENCES financeiro_folhas(id) ON DELETE CASCADE,
  funcionario_id        UUID NOT NULL REFERENCES rh_funcionarios(id) ON DELETE RESTRICT,
  salario_base          NUMERIC(15,2) NOT NULL DEFAULT 0,
  salario_liquido       NUMERIC(15,2) NOT NULL DEFAULT 0,
  vale_transporte       NUMERIC(15,2) NOT NULL DEFAULT 0,
  vale_alimentacao      NUMERIC(15,2) NOT NULL DEFAULT 0,
  unimed                NUMERIC(15,2) NOT NULL DEFAULT 0,
  comissao_comercial    NUMERIC(15,2) NOT NULL DEFAULT 0,
  comissao_contratos    NUMERIC(15,2) NOT NULL DEFAULT 0,
  ferias                NUMERIC(15,2) NOT NULL DEFAULT 0,
  decimo_terceiro       NUMERIC(15,2) NOT NULL DEFAULT 0,
  descontos             NUMERIC(15,2) NOT NULL DEFAULT 0,
  outros_creditos       NUMERIC(15,2) NOT NULL DEFAULT 0,
  outros_debitos        NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_liquido         NUMERIC(15,2) NOT NULL DEFAULT 0,
  status_pagamento      fin_status_pagamento_item NOT NULL DEFAULT 'pendente',
  data_pagamento        DATE,
  observacoes           TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_folha_funcionario UNIQUE (folha_id, funcionario_id)
);

CREATE INDEX IF NOT EXISTS idx_fin_fi_folha ON financeiro_folha_itens(folha_id);
CREATE INDEX IF NOT EXISTS idx_fin_fi_funcionario ON financeiro_folha_itens(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_fin_fi_empresa ON financeiro_folha_itens(empresa_id);

CREATE OR REPLACE TRIGGER trg_fin_fi_updated_at
  BEFORE UPDATE ON financeiro_folha_itens
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS: folhas
ALTER TABLE financeiro_folhas ENABLE ROW LEVEL SECURITY;

CREATE POLICY fin_folhas_all ON financeiro_folhas
  FOR ALL USING (
    empresa_id IN (
      SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true
    )
  );

-- RLS: folha_itens
ALTER TABLE financeiro_folha_itens ENABLE ROW LEVEL SECURITY;

CREATE POLICY fin_fi_all ON financeiro_folha_itens
  FOR ALL USING (
    empresa_id IN (
      SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true
    )
  );
