-- Novo tipo_calculo em rh_regras_comissao: 'percentual_por_negocio' — um
-- percentual aplicado direto sobre o valor de UM negócio individual (ex.:
-- valor da carta de consórcio), não sobre a produção mensal acumulada
-- (esse é o 'percentual_faixa_producao_mensal' já existente, usado em
-- Financiamento). A faixa (rh_faixas_comissao) é escolhida pelo valor do
-- negócio; uma regra com 1 faixa "0 até sem limite" funciona como taxa fixa
-- por pessoa.

ALTER TABLE rh_regras_comissao DROP CONSTRAINT IF EXISTS rh_regras_comissao_tipo_calculo_check;
ALTER TABLE rh_regras_comissao ADD CONSTRAINT rh_regras_comissao_tipo_calculo_check
  CHECK (tipo_calculo IN ('valor_fixo_emissao', 'percentual_faixa_producao_mensal', 'percentual_por_negocio'));
