-- Item 22: Acompanhar data e validade do crédito desde o Lead.
-- O crédito normalmente é aprovado na etapa de Lead, antes do Processo.
-- Quando um Processo é criado, herda validade_credito do Lead como fotografia.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS data_credito     DATE,
  ADD COLUMN IF NOT EXISTS validade_credito DATE;

COMMENT ON COLUMN leads.data_credito IS
  'Data em que o banco aprovou o crédito para este lead';
COMMENT ON COLUMN leads.validade_credito IS
  'Data de vencimento da aprovação de crédito — herdada pelo Processo no momento da criação';
