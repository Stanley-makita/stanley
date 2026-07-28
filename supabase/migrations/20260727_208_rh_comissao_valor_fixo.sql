-- Migration 208: Regras de Comissão passam a usar valor fixo (R$) em vez de
-- percentual sobre o valor financiado.
--
-- Substitui o modelo percentual no formulário de "Nova/Editar Regra de
-- Comissão": mantém as colunas percentuais antigas na tabela (usadas por
-- regras já cadastradas e pela função gerar_comissoes_a_pagar, que só será
-- alterada quando o módulo Financeiro for reformulado), mas não são mais
-- preenchidas por faixas criadas dali pra frente.
--
-- Novos campos:
-- 1. rh_regras_comissao.valor_fixo_emissao — valor fixo pago por processo
--    de financiamento emitido.
-- 2. rh_regras_comissao.valor_fixo_assessoria — valor fixo pago por
--    processo com assessoria.
-- 3. rh_faixas_comissao.valor_fixo — bônus fixo pago quando a produção do
--    período cai na faixa (valor_minimo/valor_maximo), no lugar do
--    percentual.

ALTER TABLE rh_regras_comissao
  ADD COLUMN IF NOT EXISTS valor_fixo_emissao    NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS valor_fixo_assessoria NUMERIC(14,2);

ALTER TABLE rh_faixas_comissao
  ALTER COLUMN percentual DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS valor_fixo NUMERIC(14,2);
