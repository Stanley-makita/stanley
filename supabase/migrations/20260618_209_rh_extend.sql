-- Migration 209: extend rh_faixas_comissao com percentuais por papel e piso/teto

ALTER TABLE rh_faixas_comissao
  ADD COLUMN IF NOT EXISTS pct_comercial   NUMERIC(6,3),
  ADD COLUMN IF NOT EXISTS pct_operacional NUMERIC(6,3),
  ADD COLUMN IF NOT EXISTS pct_parceiro    NUMERIC(6,3),
  ADD COLUMN IF NOT EXISTS piso_valor      NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS teto_valor      NUMERIC(14,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN rh_faixas_comissao.pct_comercial   IS 'Percentual específico para papel comercial. Usa percentual geral se NULL.';
COMMENT ON COLUMN rh_faixas_comissao.pct_operacional IS 'Percentual específico para papel operacional. Usa percentual geral se NULL.';
COMMENT ON COLUMN rh_faixas_comissao.pct_parceiro    IS 'Percentual específico para parceiro/assessoria. Usa percentual geral se NULL.';
COMMENT ON COLUMN rh_faixas_comissao.piso_valor      IS 'Valor mínimo garantido de comissão. 0 = sem piso.';
COMMENT ON COLUMN rh_faixas_comissao.teto_valor      IS 'Valor máximo de comissão. 0 = sem teto.';
