-- Migration 204: financeiro_comissoes_pagar + extend comissoes_padrao

-- Enums
DO $$ BEGIN
  CREATE TYPE fin_papel_comissao AS ENUM (
    'comercial',
    'operacional',
    'parceiro',
    'assessoria',
    'gerente',
    'outro'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE fin_status_comissao_pagar AS ENUM (
    'calculada',
    'em_revisao',
    'aprovada',
    'paga',
    'suspensa',
    'cancelada'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Tabela de comissões a pagar
CREATE TABLE IF NOT EXISTS financeiro_comissoes_pagar (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id              UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  fechamento_id           UUID NOT NULL REFERENCES financeiro_fechamentos(id) ON DELETE CASCADE,
  processo_id             UUID REFERENCES processos(id) ON DELETE SET NULL,

  -- Destinatário (um dos três deve ser preenchido)
  pessoa_id               UUID,  -- genérico para externos sem cadastro
  usuario_id              UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  funcionario_id          UUID REFERENCES rh_funcionarios(id) ON DELETE SET NULL,
  tipo_destinatario       TEXT NOT NULL DEFAULT 'funcionario'
                          CHECK (tipo_destinatario IN ('funcionario', 'usuario', 'externo')),

  papel                   fin_papel_comissao NOT NULL DEFAULT 'comercial',
  regra_id                UUID REFERENCES rh_regras_comissao(id) ON DELETE SET NULL,

  valor_base              NUMERIC(15,2) NOT NULL DEFAULT 0,
  percentual              NUMERIC(6,3) NOT NULL DEFAULT 0,
  valor_calculado         NUMERIC(15,2) NOT NULL DEFAULT 0,
  ajuste_manual           NUMERIC(15,2) NOT NULL DEFAULT 0,
  valor_final             NUMERIC(15,2) GENERATED ALWAYS AS (valor_calculado + ajuste_manual) STORED,

  status                  fin_status_comissao_pagar NOT NULL DEFAULT 'calculada',
  data_prevista_pagamento DATE,
  data_pagamento          DATE,
  observacoes             TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_fin_cp_empresa ON financeiro_comissoes_pagar(empresa_id);
CREATE INDEX IF NOT EXISTS idx_fin_cp_fechamento ON financeiro_comissoes_pagar(fechamento_id);
CREATE INDEX IF NOT EXISTS idx_fin_cp_funcionario ON financeiro_comissoes_pagar(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_fin_cp_usuario ON financeiro_comissoes_pagar(usuario_id);
CREATE INDEX IF NOT EXISTS idx_fin_cp_processo ON financeiro_comissoes_pagar(processo_id);
CREATE INDEX IF NOT EXISTS idx_fin_cp_status ON financeiro_comissoes_pagar(empresa_id, status);

CREATE OR REPLACE TRIGGER trg_fin_cp_updated_at
  BEFORE UPDATE ON financeiro_comissoes_pagar
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS
ALTER TABLE financeiro_comissoes_pagar ENABLE ROW LEVEL SECURITY;

CREATE POLICY fin_cp_select ON financeiro_comissoes_pagar
  FOR SELECT USING (
    empresa_id IN (
      SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true
    )
  );

CREATE POLICY fin_cp_insert ON financeiro_comissoes_pagar
  FOR INSERT WITH CHECK (
    empresa_id IN (
      SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true
    )
    AND EXISTS (
      SELECT 1 FROM financeiro_fechamentos f
      WHERE f.id = fechamento_id AND f.status != 'travado'
    )
  );

CREATE POLICY fin_cp_update ON financeiro_comissoes_pagar
  FOR UPDATE USING (
    empresa_id IN (
      SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true
    )
    AND EXISTS (
      SELECT 1 FROM financeiro_fechamentos f
      WHERE f.id = fechamento_id AND f.status != 'travado'
    )
  );

CREATE POLICY fin_cp_delete ON financeiro_comissoes_pagar
  FOR DELETE USING (
    empresa_id IN (
      SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true
    )
    AND EXISTS (
      SELECT 1 FROM financeiro_fechamentos f
      WHERE f.id = fechamento_id AND f.status != 'travado'
    )
  );

-- Estender comissoes_padrao com percentuais por papel
ALTER TABLE comissoes_padrao
  ADD COLUMN IF NOT EXISTS comissao_operacional NUMERIC(5,2) NOT NULL DEFAULT 0
    CHECK (comissao_operacional >= 0 AND comissao_operacional <= 100),
  ADD COLUMN IF NOT EXISTS comissao_parceiro NUMERIC(5,2) NOT NULL DEFAULT 0
    CHECK (comissao_parceiro >= 0 AND comissao_parceiro <= 100);
