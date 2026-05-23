-- Unifica Conta, Custas e Cobranças em uma única tabela de lançamentos financeiros por processo

CREATE TABLE IF NOT EXISTS processo_financeiro (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID        NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  processo_id UUID        NOT NULL REFERENCES processos(id) ON DELETE CASCADE,
  descricao   TEXT        NOT NULL,
  valor       NUMERIC(12,2) NOT NULL,
  tipo        TEXT        NOT NULL CHECK (tipo IN (
    'receita_empresa',
    'custo_empresa',
    'repasse_cliente',
    'deposito_cliente'
  )),
  situacao    TEXT        NOT NULL DEFAULT 'pendente' CHECK (situacao IN (
    'pendente',
    'pago',
    'cancelado'
  )),
  pago_em     TIMESTAMPTZ,
  observacao  TEXT,
  criado_por  UUID        REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_processo_financeiro_processo ON processo_financeiro(processo_id);
CREATE INDEX idx_processo_financeiro_empresa  ON processo_financeiro(empresa_id);

ALTER TABLE processo_financeiro ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pf_select" ON processo_financeiro FOR SELECT
  USING (empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid()));

CREATE POLICY "pf_insert" ON processo_financeiro FOR INSERT
  WITH CHECK (empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid()));

CREATE POLICY "pf_update" ON processo_financeiro FOR UPDATE
  USING (empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid()));

CREATE POLICY "pf_delete" ON processo_financeiro FOR DELETE
  USING (empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid()));

-- Trigger: ao criar processo com assessoria e comissão definida, gera lançamento automático
CREATE OR REPLACE FUNCTION fn_auto_lancamento_assessoria()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.tem_assessoria = true
     AND NEW.comissao_empresa IS NOT NULL
     AND NEW.comissao_empresa > 0
  THEN
    INSERT INTO processo_financeiro(empresa_id, processo_id, descricao, valor, tipo, situacao, criado_por)
    VALUES (
      NEW.empresa_id,
      NEW.id,
      'Assessoria',
      NEW.comissao_empresa,
      'receita_empresa',
      'pendente',
      auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_lancamento_assessoria
  AFTER INSERT ON processos
  FOR EACH ROW EXECUTE FUNCTION fn_auto_lancamento_assessoria();
