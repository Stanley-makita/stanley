-- Migration 208: financeiro_ajustes + financeiro_conferencias

-- Enums conferência
DO $$ BEGIN
  CREATE TYPE fin_tipo_conferencia AS ENUM (
    'processo_sem_regra_comissao',
    'processo_sem_comercial',
    'processo_sem_operacional',
    'conta_receber_sem_nf',
    'recebimento_divergente',
    'comissao_sem_funcionario',
    'despesa_vencida',
    'folha_incompleta',
    'saldo_bancario_nao_informado',
    'duplicidade_processo',
    'valor_negativo',
    'regra_expirada'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE fin_severidade_conferencia AS ENUM ('info', 'alerta', 'critico');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE fin_status_conferencia AS ENUM ('pendente', 'ok', 'ignorada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Ajustes Auditáveis
CREATE TABLE IF NOT EXISTS financeiro_ajustes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  fechamento_id       UUID NOT NULL REFERENCES financeiro_fechamentos(id) ON DELETE CASCADE,
  entidade_tipo       TEXT NOT NULL,
  entidade_id         UUID NOT NULL,
  tipo_ajuste         TEXT NOT NULL CHECK (tipo_ajuste IN ('valor', 'status', 'vinculo', 'inclusao', 'exclusao')),
  valor_anterior      TEXT,
  valor_novo          TEXT,
  motivo              TEXT NOT NULL,
  criado_por          UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  criado_em           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fin_aj_empresa ON financeiro_ajustes(empresa_id);
CREATE INDEX IF NOT EXISTS idx_fin_aj_fechamento ON financeiro_ajustes(fechamento_id);
CREATE INDEX IF NOT EXISTS idx_fin_aj_entidade ON financeiro_ajustes(entidade_tipo, entidade_id);

-- Conferências do Fechamento
CREATE TABLE IF NOT EXISTS financeiro_conferencias (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  fechamento_id       UUID NOT NULL REFERENCES financeiro_fechamentos(id) ON DELETE CASCADE,
  tipo                fin_tipo_conferencia NOT NULL,
  severidade          fin_severidade_conferencia NOT NULL DEFAULT 'alerta',
  status              fin_status_conferencia NOT NULL DEFAULT 'pendente',
  titulo              TEXT NOT NULL,
  descricao           TEXT,
  entidade_tipo       TEXT,
  entidade_id         UUID,
  resolvido_por       UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  resolvido_em        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fin_conf_empresa ON financeiro_conferencias(empresa_id);
CREATE INDEX IF NOT EXISTS idx_fin_conf_fechamento ON financeiro_conferencias(fechamento_id);
CREATE INDEX IF NOT EXISTS idx_fin_conf_status ON financeiro_conferencias(fechamento_id, status);
CREATE INDEX IF NOT EXISTS idx_fin_conf_tipo ON financeiro_conferencias(fechamento_id, tipo);

-- RLS: ajustes (aberto mesmo com fechamento travado — é o log de auditoria)
ALTER TABLE financeiro_ajustes ENABLE ROW LEVEL SECURITY;

CREATE POLICY fin_aj_select ON financeiro_ajustes
  FOR SELECT USING (
    empresa_id IN (
      SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true
    )
  );

CREATE POLICY fin_aj_insert ON financeiro_ajustes
  FOR INSERT WITH CHECK (
    empresa_id IN (
      SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true
    )
  );

-- ajustes não podem ser atualizados ou deletados (imutáveis por design)

-- RLS: conferencias
ALTER TABLE financeiro_conferencias ENABLE ROW LEVEL SECURITY;

CREATE POLICY fin_conf_all ON financeiro_conferencias
  FOR ALL USING (
    empresa_id IN (
      SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true
    )
  );
