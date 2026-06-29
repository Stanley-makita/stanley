-- ============================================================
-- Migration 137: Análises de Crédito por Lead
-- Permite múltiplas análises de crédito vinculadas a um Lead.
-- Os campos antigos em `leads` são preservados (não removidos).
-- ============================================================

CREATE TABLE IF NOT EXISTS lead_analises_credito (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id       UUID        NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  lead_id          UUID        NOT NULL REFERENCES leads(id)    ON DELETE CASCADE,
  nome             TEXT        NOT NULL DEFAULT 'Análise Principal',
  banco_pretendido TEXT,
  valor_imovel     NUMERIC(15,2),
  valor_pretendido NUMERIC(15,2),
  entrada          NUMERIC(15,2),
  prazo_meses      INTEGER,
  finalidade       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_analises_credito_lead    ON lead_analises_credito(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_analises_credito_empresa ON lead_analises_credito(empresa_id);

-- RLS
ALTER TABLE lead_analises_credito ENABLE ROW LEVEL SECURITY;

CREATE POLICY "autenticados leem lead_analises_credito"
  ON lead_analises_credito FOR SELECT TO authenticated USING (true);
CREATE POLICY "autenticados escrevem lead_analises_credito"
  ON lead_analises_credito FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_lead_analises_credito_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_lead_analises_credito_updated_at
  BEFORE UPDATE ON lead_analises_credito
  FOR EACH ROW EXECUTE FUNCTION update_lead_analises_credito_updated_at();

-- Backfill: leads com pelo menos um campo de crédito preenchido
INSERT INTO lead_analises_credito (
  empresa_id, lead_id, nome,
  banco_pretendido, valor_imovel, valor_pretendido, entrada, prazo_meses, finalidade
)
SELECT
  l.empresa_id,
  l.id,
  'Análise Principal',
  l.banco_pretendido,
  l.valor_imovel,
  l.valor_pretendido,
  l.entrada,
  l.prazo_meses,
  l.finalidade
FROM leads l
WHERE l.deleted_at IS NULL
  AND (
    l.banco_pretendido IS NOT NULL OR
    l.valor_imovel     IS NOT NULL OR
    l.valor_pretendido IS NOT NULL OR
    l.entrada          IS NOT NULL OR
    l.prazo_meses      IS NOT NULL OR
    l.finalidade       IS NOT NULL
  )
ON CONFLICT DO NOTHING;
