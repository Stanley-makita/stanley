-- Migration 207: cadastro de Benefícios do funcionário (RH)
--
-- Cadastro informativo dos valores de benefícios concedidos ao
-- funcionário (Vale Transporte, Vale Alimentação, Plano de Saúde, Plano
-- Odontológico). Não alimenta automaticamente a Folha de Pagamento —
-- financeiro_folha_itens continua sendo lançado manualmente por
-- competência, como já funciona hoje.

ALTER TABLE rh_funcionarios
  ADD COLUMN IF NOT EXISTS beneficio_vale_transporte    NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS beneficio_vale_alimentacao   NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS beneficio_plano_saude        NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS beneficio_plano_odontologico NUMERIC(12,2);
