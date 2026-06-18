-- Migration 201: financeiro_fechamentos
-- Tabela central do fechamento mensal financeiro

-- Enums
DO $$ BEGIN
  CREATE TYPE fin_fechamento_status AS ENUM (
    'rascunho',
    'em_conferencia',
    'aprovado',
    'pago',
    'travado',
    'reaberto'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Tabela principal
CREATE TABLE IF NOT EXISTS financeiro_fechamentos (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  competencia_mes   INTEGER NOT NULL CHECK (competencia_mes BETWEEN 1 AND 12),
  competencia_ano   INTEGER NOT NULL CHECK (competencia_ano BETWEEN 2020 AND 2100),
  status            fin_fechamento_status NOT NULL DEFAULT 'rascunho',
  aberto_em         TIMESTAMPTZ NOT NULL DEFAULT now(),
  aprovado_em       TIMESTAMPTZ,
  travado_em        TIMESTAMPTZ,
  aprovado_por      UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  observacoes       TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_fechamento_competencia UNIQUE (empresa_id, competencia_ano, competencia_mes)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_fin_fechamentos_empresa ON financeiro_fechamentos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_fin_fechamentos_competencia ON financeiro_fechamentos(empresa_id, competencia_ano, competencia_mes);
CREATE INDEX IF NOT EXISTS idx_fin_fechamentos_status ON financeiro_fechamentos(empresa_id, status);

-- Trigger updated_at
CREATE OR REPLACE TRIGGER trg_fin_fechamentos_updated_at
  BEFORE UPDATE ON financeiro_fechamentos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS
ALTER TABLE financeiro_fechamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY fin_fechamentos_select ON financeiro_fechamentos
  FOR SELECT USING (
    empresa_id IN (
      SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true
    )
  );

CREATE POLICY fin_fechamentos_insert ON financeiro_fechamentos
  FOR INSERT WITH CHECK (
    empresa_id IN (
      SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true
    )
  );

CREATE POLICY fin_fechamentos_update ON financeiro_fechamentos
  FOR UPDATE USING (
    empresa_id IN (
      SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true
    )
    AND status != 'travado'
  );

CREATE POLICY fin_fechamentos_delete ON financeiro_fechamentos
  FOR DELETE USING (
    empresa_id IN (
      SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true
    )
    AND status = 'rascunho'
  );
