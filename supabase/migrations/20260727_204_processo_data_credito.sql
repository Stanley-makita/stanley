-- Data da Aprovação de Crédito do Processo — mesmo conceito de leads.data_credito
-- (20260628_131), agora necessário porque negócios em Financiamento podem
-- registrar novas análises/aprovações sem voltar pra fase de Lead (ver
-- 20260727_203_analises_credito_processo.sql). Independente de
-- processos.validade_credito, que o operador decide se atualiza ou não.
ALTER TABLE processos ADD COLUMN IF NOT EXISTS data_credito DATE;

COMMENT ON COLUMN processos.data_credito IS
  'Data em que o crédito foi aprovado neste processo — referência para a Validade do Crédito, mas o operador escolhe se uma nova aprovação atualiza a validade ou não.';
