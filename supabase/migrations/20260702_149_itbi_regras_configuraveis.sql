-- Torna configuráveis as regras de ITBI hoje hardcoded no motor de cálculo
-- (Curitiba, Grupo Maringá, Sarandi): fórmula composta (% sobre financiado + % sobre C&V)
-- e a exceção de "perde desconto na 1ª aquisição acima de um limite".
-- Cidades sem essas colunas preenchidas continuam usando a fórmula percentual simples
-- de sempre; as regras hardcoded do motor só entram como fallback se a cidade não
-- estiver cadastrada nesta tabela.

ALTER TABLE simulador_itbi_config
  ADD COLUMN IF NOT EXISTS formula_com_desconto TEXT NOT NULL DEFAULT 'percentual'
    CHECK (formula_com_desconto IN ('percentual', 'composta')),
  ADD COLUMN IF NOT EXISTS aliquota_desconto_financiado NUMERIC(6,4),
  ADD COLUMN IF NOT EXISTS excecao_primeira_aquisicao BOOLEAN NOT NULL DEFAULT false;
