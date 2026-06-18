-- Migration 203: contas_receber, notas_fiscais, recebimentos

-- Enums
DO $$ BEGIN
  CREATE TYPE fin_status_conta_receber AS ENUM (
    'a_faturar',
    'faturado',
    'recebido_parcial',
    'recebido',
    'vencido',
    'cancelado'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE fin_status_nf AS ENUM ('emitida', 'cancelada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Contas a Receber
CREATE TABLE IF NOT EXISTS financeiro_contas_receber (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  fechamento_id         UUID REFERENCES financeiro_fechamentos(id) ON DELETE SET NULL,
  processo_id           UUID REFERENCES processos(id) ON DELETE SET NULL,
  banco_id              UUID REFERENCES bancos(id) ON DELETE SET NULL,
  cliente_nome          TEXT,
  origem                TEXT NOT NULL DEFAULT 'emissao' CHECK (origem IN ('emissao', 'avulso', 'assinatura')),
  valor_base            NUMERIC(15,2) NOT NULL DEFAULT 0,
  percentual_previsto   NUMERIC(6,3) DEFAULT 0,
  valor_previsto        NUMERIC(15,2) NOT NULL DEFAULT 0,
  valor_recebido        NUMERIC(15,2) NOT NULL DEFAULT 0,
  status                fin_status_conta_receber NOT NULL DEFAULT 'a_faturar',
  data_prevista         DATE,
  data_recebimento      DATE,
  observacoes           TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fin_cr_empresa ON financeiro_contas_receber(empresa_id);
CREATE INDEX IF NOT EXISTS idx_fin_cr_fechamento ON financeiro_contas_receber(fechamento_id);
CREATE INDEX IF NOT EXISTS idx_fin_cr_processo ON financeiro_contas_receber(processo_id);
CREATE INDEX IF NOT EXISTS idx_fin_cr_status ON financeiro_contas_receber(empresa_id, status);

CREATE OR REPLACE TRIGGER trg_fin_cr_updated_at
  BEFORE UPDATE ON financeiro_contas_receber
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Notas Fiscais
CREATE TABLE IF NOT EXISTS financeiro_notas_fiscais (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  conta_receber_id    UUID NOT NULL REFERENCES financeiro_contas_receber(id) ON DELETE CASCADE,
  numero_nf           TEXT,
  valor_nf            NUMERIC(15,2),
  data_emissao        DATE NOT NULL,
  data_recebimento    DATE,
  status              fin_status_nf NOT NULL DEFAULT 'emitida',
  arquivo_url         TEXT,
  observacoes         TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fin_nf_empresa ON financeiro_notas_fiscais(empresa_id);
CREATE INDEX IF NOT EXISTS idx_fin_nf_conta ON financeiro_notas_fiscais(conta_receber_id);

-- Recebimentos
CREATE TABLE IF NOT EXISTS financeiro_recebimentos (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  conta_receber_id    UUID NOT NULL REFERENCES financeiro_contas_receber(id) ON DELETE CASCADE,
  valor               NUMERIC(15,2) NOT NULL CHECK (valor > 0),
  data_recebimento    DATE NOT NULL,
  banco_conta_id      UUID,  -- FK adicionada na migration 207 (contas_bancarias ainda não existe)
  forma_recebimento   TEXT CHECK (forma_recebimento IN ('transferencia', 'pix', 'boleto', 'outros')),
  comprovante_url     TEXT,
  observacoes         TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fin_rec_empresa ON financeiro_recebimentos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_fin_rec_conta ON financeiro_recebimentos(conta_receber_id);

-- Trigger: atualizar valor_recebido e status em contas_receber após insert/delete de recebimento
CREATE OR REPLACE FUNCTION fn_sync_conta_receber_status()
RETURNS TRIGGER AS $$
DECLARE
  v_conta RECORD;
BEGIN
  SELECT valor_previsto, valor_recebido
  INTO v_conta
  FROM financeiro_contas_receber
  WHERE id = COALESCE(NEW.conta_receber_id, OLD.conta_receber_id);

  UPDATE financeiro_contas_receber
  SET
    valor_recebido = (
      SELECT COALESCE(SUM(valor), 0)
      FROM financeiro_recebimentos
      WHERE conta_receber_id = COALESCE(NEW.conta_receber_id, OLD.conta_receber_id)
    ),
    status = CASE
      WHEN (SELECT COALESCE(SUM(valor), 0) FROM financeiro_recebimentos WHERE conta_receber_id = COALESCE(NEW.conta_receber_id, OLD.conta_receber_id)) = 0
        THEN 'a_faturar'::fin_status_conta_receber
      WHEN (SELECT COALESCE(SUM(valor), 0) FROM financeiro_recebimentos WHERE conta_receber_id = COALESCE(NEW.conta_receber_id, OLD.conta_receber_id)) >= valor_previsto
        THEN 'recebido'::fin_status_conta_receber
      ELSE 'recebido_parcial'::fin_status_conta_receber
    END
  WHERE id = COALESCE(NEW.conta_receber_id, OLD.conta_receber_id);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER trg_sync_conta_receber
  AFTER INSERT OR UPDATE OR DELETE ON financeiro_recebimentos
  FOR EACH ROW EXECUTE FUNCTION fn_sync_conta_receber_status();

-- Trigger: atualizar status para 'faturado' quando NF emitida
CREATE OR REPLACE FUNCTION fn_sync_status_nf()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'emitida' THEN
    UPDATE financeiro_contas_receber
    SET status = 'faturado'
    WHERE id = NEW.conta_receber_id AND status = 'a_faturar';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER trg_sync_nf_status
  AFTER INSERT ON financeiro_notas_fiscais
  FOR EACH ROW EXECUTE FUNCTION fn_sync_status_nf();

-- RLS: contas_receber
ALTER TABLE financeiro_contas_receber ENABLE ROW LEVEL SECURITY;

CREATE POLICY fin_cr_all ON financeiro_contas_receber
  FOR ALL USING (
    empresa_id IN (
      SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true
    )
  );

-- RLS: notas_fiscais
ALTER TABLE financeiro_notas_fiscais ENABLE ROW LEVEL SECURITY;

CREATE POLICY fin_nf_all ON financeiro_notas_fiscais
  FOR ALL USING (
    empresa_id IN (
      SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true
    )
  );

-- RLS: recebimentos
ALTER TABLE financeiro_recebimentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY fin_rec_all ON financeiro_recebimentos
  FOR ALL USING (
    empresa_id IN (
      SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true
    )
  );
