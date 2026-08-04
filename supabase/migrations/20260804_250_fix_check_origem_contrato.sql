-- Migration 250: Fix — CHECK constraint de financeiro_contas_receber.origem
-- não incluía 'contrato'
--
-- puxar_contratos (existe desde a migration 235) grava origem='contrato' ao
-- puxar um processo de modalidade Contrato pro fechamento, mas o CHECK
-- constraint original (migration 20260618_203_fin_receber.sql) só permitia
-- ('emissao', 'avulso', 'assinatura') — bug latente nunca disparado até
-- hoje (Aprovar Fechamento falhando com "violates check constraint" ao
-- reprocessar agosto/2026, que tem um Contrato emitido no período).

ALTER TABLE financeiro_contas_receber
  DROP CONSTRAINT IF EXISTS financeiro_contas_receber_origem_check;

ALTER TABLE financeiro_contas_receber
  ADD CONSTRAINT financeiro_contas_receber_origem_check
  CHECK (origem IN ('emissao', 'avulso', 'assinatura', 'contrato'));
