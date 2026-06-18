-- Migration 207: financeiro_contas_bancarias + financeiro_saldos_bancarios

-- Enums
DO $$ BEGIN
  CREATE TYPE fin_tipo_conta_bancaria AS ENUM ('corrente', 'poupanca', 'investimento');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Contas Bancárias
CREATE TABLE IF NOT EXISTS financeiro_contas_bancarias (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  banco_nome          TEXT NOT NULL,
  agencia             TEXT,
  conta               TEXT,
  tipo                fin_tipo_conta_bancaria NOT NULL DEFAULT 'corrente',
  apelido             TEXT,
  ativa               BOOLEAN NOT NULL DEFAULT true,
  saldo_inicial       NUMERIC(15,2) NOT NULL DEFAULT 0,
  observacoes         TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fin_cb_empresa ON financeiro_contas_bancarias(empresa_id);
CREATE INDEX IF NOT EXISTS idx_fin_cb_ativa ON financeiro_contas_bancarias(empresa_id, ativa);

-- Saldos Bancários por competência
CREATE TABLE IF NOT EXISTS financeiro_saldos_bancarios (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  conta_bancaria_id   UUID NOT NULL REFERENCES financeiro_contas_bancarias(id) ON DELETE CASCADE,
  fechamento_id       UUID REFERENCES financeiro_fechamentos(id) ON DELETE SET NULL,
  data_saldo          DATE NOT NULL,
  saldo_informado     NUMERIC(15,2) NOT NULL,
  origem              TEXT NOT NULL DEFAULT 'manual' CHECK (origem IN ('manual', 'automatico')),
  observacoes         TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fin_sb_conta ON financeiro_saldos_bancarios(conta_bancaria_id);
CREATE INDEX IF NOT EXISTS idx_fin_sb_empresa ON financeiro_saldos_bancarios(empresa_id);
CREATE INDEX IF NOT EXISTS idx_fin_sb_fechamento ON financeiro_saldos_bancarios(fechamento_id);
CREATE INDEX IF NOT EXISTS idx_fin_sb_data ON financeiro_saldos_bancarios(conta_bancaria_id, data_saldo);

-- Adicionar FK de banco_conta_id em recebimentos (criado na 203 sem a FK pois a tabela não existia)
ALTER TABLE financeiro_recebimentos
  ADD CONSTRAINT fk_rec_conta_bancaria
  FOREIGN KEY (banco_conta_id) REFERENCES financeiro_contas_bancarias(id) ON DELETE SET NULL;

-- RLS: contas_bancarias
ALTER TABLE financeiro_contas_bancarias ENABLE ROW LEVEL SECURITY;

CREATE POLICY fin_cb_all ON financeiro_contas_bancarias
  FOR ALL USING (
    empresa_id IN (
      SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true
    )
  );

-- RLS: saldos_bancarios
ALTER TABLE financeiro_saldos_bancarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY fin_sb_all ON financeiro_saldos_bancarios
  FOR ALL USING (
    empresa_id IN (
      SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true
    )
  );
