-- 351 — Oportunidade: tipo de imóvel pretendido e despesas financiadas, acompanhando o negócio (10/11/2026).
--
-- Tipo de imóvel PRETENDIDO (o que o cliente quer financiar): já existia em leads.tipo_imovel (migration 089),
-- sem campo na tela e sem ir para o negócio. Independente do tipo do imóvel CADASTRADO (imoveis.tipo /
-- *.imovel_tipo). O negócio ganha a mesma coluna, copiada na conversão.
--
-- Despesas financiadas (custas junto com o financiamento, até 5% do imóvel): o negócio já tinha a chave
-- processos.financiar_despesas_cartorariais (068). Agora o lead também tem (NULL = não definido) e os dois
-- ganham o valor.
--
-- Limpeza: o bot gravava 'apartamento' sempre que o comercial dizia "imóvel novo/usado" (mapTipoImovelLead) —
-- não é informação real; volta a não informado. Depois disso, quem tem imóvel cadastrado vinculado recebe o
-- tipo sugerido a partir dele (só onde está vazio).

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS financiar_despesas_cartorariais BOOLEAN,
  ADD COLUMN IF NOT EXISTS valor_despesas_financiadas      NUMERIC(15,2) CHECK (valor_despesas_financiadas >= 0);

ALTER TABLE processos
  ADD COLUMN IF NOT EXISTS tipo_imovel                TEXT,
  ADD COLUMN IF NOT EXISTS valor_despesas_financiadas NUMERIC(15,2) CHECK (valor_despesas_financiadas >= 0);

ALTER TABLE processos DROP CONSTRAINT IF EXISTS chk_processo_tipo_imovel;
ALTER TABLE processos ADD CONSTRAINT chk_processo_tipo_imovel CHECK (
  tipo_imovel IS NULL OR tipo_imovel IN ('apartamento', 'casa', 'terreno', 'comercial', 'rural')
);

COMMENT ON COLUMN leads.tipo_imovel IS 'Tipo de imóvel PRETENDIDO (Oportunidade). Independente de imovel_tipo (imóvel cadastrado).';
COMMENT ON COLUMN processos.tipo_imovel IS 'Tipo de imóvel PRETENDIDO, copiado do lead. Independente de imovel_tipo (imóvel cadastrado).';
COMMENT ON COLUMN leads.financiar_despesas_cartorariais IS 'Cliente vai financiar as despesas (custas) junto. NULL = não definido.';
COMMENT ON COLUMN leads.valor_despesas_financiadas IS 'Valor das despesas financiadas (sugerido 5% do imóvel).';
COMMENT ON COLUMN processos.valor_despesas_financiadas IS 'Valor das despesas financiadas (sugerido 5% do imóvel).';

-- Limpeza do valor gravado pelo bot
UPDATE leads SET tipo_imovel = NULL WHERE tipo_imovel = 'apartamento';

-- Sugestão a partir do imóvel cadastrado (só onde está vazio)
UPDATE leads SET tipo_imovel = CASE imovel_tipo
    WHEN 'casa' THEN 'casa' WHEN 'sobrado' THEN 'casa' WHEN 'apartamento' THEN 'apartamento'
    WHEN 'terreno' THEN 'terreno' WHEN 'barracao' THEN 'comercial' END
  WHERE tipo_imovel IS NULL AND imovel_tipo IN ('casa', 'sobrado', 'apartamento', 'terreno', 'barracao');

UPDATE processos SET tipo_imovel = CASE imovel_tipo
    WHEN 'casa' THEN 'casa' WHEN 'sobrado' THEN 'casa' WHEN 'apartamento' THEN 'apartamento'
    WHEN 'terreno' THEN 'terreno' WHEN 'barracao' THEN 'comercial' END
  WHERE tipo_imovel IS NULL AND imovel_tipo IN ('casa', 'sobrado', 'apartamento', 'terreno', 'barracao');
