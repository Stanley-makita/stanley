-- Migration 206: financeiro_despesas + financeiro_despesas_recorrentes

-- Enums
DO $$ BEGIN
  CREATE TYPE fin_tipo_despesa AS ENUM ('recorrente', 'avulsa');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE fin_categoria_despesa AS ENUM (
    'aluguel',
    'salarios',
    'marketing',
    'software',
    'impostos',
    'servicos',
    'outros'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE fin_status_despesa AS ENUM ('prevista', 'a_pagar', 'paga', 'vencida', 'cancelada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Template de despesas recorrentes (modelo mensal)
CREATE TABLE IF NOT EXISTS financeiro_despesas_recorrentes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  categoria           fin_categoria_despesa NOT NULL DEFAULT 'outros',
  fornecedor          TEXT,
  descricao           TEXT NOT NULL,
  valor_padrao        NUMERIC(15,2),
  dia_vencimento      INTEGER CHECK (dia_vencimento BETWEEN 1 AND 31),
  ativa               BOOLEAN NOT NULL DEFAULT true,
  data_inicio         DATE NOT NULL,
  data_fim            DATE,
  observacoes         TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fin_dr_empresa ON financeiro_despesas_recorrentes(empresa_id);
CREATE INDEX IF NOT EXISTS idx_fin_dr_ativa ON financeiro_despesas_recorrentes(empresa_id, ativa);

CREATE OR REPLACE TRIGGER trg_fin_dr_updated_at
  BEFORE UPDATE ON financeiro_despesas_recorrentes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Despesas (avulsas e recorrentes instanciadas)
CREATE TABLE IF NOT EXISTS financeiro_despesas (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  fechamento_id       UUID REFERENCES financeiro_fechamentos(id) ON DELETE SET NULL,
  tipo                fin_tipo_despesa NOT NULL DEFAULT 'avulsa',
  categoria           fin_categoria_despesa NOT NULL DEFAULT 'outros',
  fornecedor          TEXT,
  descricao           TEXT NOT NULL,
  valor               NUMERIC(15,2) NOT NULL CHECK (valor >= 0),
  data_vencimento     DATE,
  data_pagamento      DATE,
  status              fin_status_despesa NOT NULL DEFAULT 'prevista',
  recorrente_id       UUID REFERENCES financeiro_despesas_recorrentes(id) ON DELETE SET NULL,
  comprovante_url     TEXT,
  observacoes         TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fin_desp_empresa ON financeiro_despesas(empresa_id);
CREATE INDEX IF NOT EXISTS idx_fin_desp_fechamento ON financeiro_despesas(fechamento_id);
CREATE INDEX IF NOT EXISTS idx_fin_desp_status ON financeiro_despesas(empresa_id, status);
CREATE INDEX IF NOT EXISTS idx_fin_desp_vencimento ON financeiro_despesas(empresa_id, data_vencimento);

CREATE OR REPLACE TRIGGER trg_fin_despesas_updated_at
  BEFORE UPDATE ON financeiro_despesas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS: despesas_recorrentes
ALTER TABLE financeiro_despesas_recorrentes ENABLE ROW LEVEL SECURITY;

CREATE POLICY fin_dr_all ON financeiro_despesas_recorrentes
  FOR ALL USING (
    empresa_id IN (
      SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true
    )
  );

-- RLS: despesas
ALTER TABLE financeiro_despesas ENABLE ROW LEVEL SECURITY;

CREATE POLICY fin_desp_select ON financeiro_despesas
  FOR SELECT USING (
    empresa_id IN (
      SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true
    )
  );

CREATE POLICY fin_desp_insert ON financeiro_despesas
  FOR INSERT WITH CHECK (
    empresa_id IN (
      SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true
    )
  );

CREATE POLICY fin_desp_update ON financeiro_despesas
  FOR UPDATE USING (
    empresa_id IN (
      SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true
    )
    AND (
      fechamento_id IS NULL
      OR EXISTS (
        SELECT 1 FROM financeiro_fechamentos f
        WHERE f.id = fechamento_id AND f.status != 'travado'
      )
    )
  );

CREATE POLICY fin_desp_delete ON financeiro_despesas
  FOR DELETE USING (
    empresa_id IN (
      SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true
    )
    AND (
      fechamento_id IS NULL
      OR EXISTS (
        SELECT 1 FROM financeiro_fechamentos f
        WHERE f.id = fechamento_id AND f.status != 'travado'
      )
    )
  );
