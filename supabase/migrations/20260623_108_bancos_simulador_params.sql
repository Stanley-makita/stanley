-- Adiciona parâmetros de simulação à tabela bancos
-- Permite editar taxas, MIP, DFI, LTV e prazo sem alterar código

ALTER TABLE bancos
  ADD COLUMN IF NOT EXISTS simulador_key     TEXT,          -- mapeia p/ BancoId ('caixa','itau',etc.)
  ADD COLUMN IF NOT EXISTS taxa_anual        NUMERIC(6,4),  -- taxa a.a. ex: 11.9000
  ADD COLUMN IF NOT EXISTS taxa_admin        NUMERIC(8,2)   DEFAULT 0,    -- tarifa mensal fixa (Caixa R$25)
  ADD COLUMN IF NOT EXISTS ltv_maximo        NUMERIC(5,2)   DEFAULT 80,   -- % máx financiado s/ imóvel
  ADD COLUMN IF NOT EXISTS idade_max_quit    INTEGER        DEFAULT 80,   -- idade máx na quitação
  ADD COLUMN IF NOT EXISTS comprometimento   NUMERIC(5,2)   DEFAULT 30,   -- % máx comprometimento renda
  ADD COLUMN IF NOT EXISTS seguro_mip        NUMERIC(9,6),  -- alíquota MIP mensal % s/ saldo devedor
  ADD COLUMN IF NOT EXISTS seguro_dfi        NUMERIC(9,6);  -- alíquota DFI mensal % s/ valor imóvel

-- Índice para lookup rápido pelo simulador_key
CREATE UNIQUE INDEX IF NOT EXISTS bancos_simulador_key_empresa
  ON bancos(empresa_id, simulador_key)
  WHERE simulador_key IS NOT NULL;

COMMENT ON COLUMN bancos.simulador_key  IS 'Chave interna do motor de simulação (caixa, itau, bradesco, santander, bb, inter, daycoval)';
COMMENT ON COLUMN bancos.taxa_anual     IS 'Taxa de juros anual a.a. (ex: 11.9 = 11,90%). Sobrescreve o valor fixado no código.';
COMMENT ON COLUMN bancos.taxa_admin     IS 'Tarifa de administração mensal em R$ (ex: 25.00 para Caixa)';
COMMENT ON COLUMN bancos.ltv_maximo     IS 'LTV máximo em % (ex: 80 = 80% do valor do imóvel)';
COMMENT ON COLUMN bancos.seguro_mip     IS 'Alíquota MIP mensal em % sobre saldo devedor (ex: 0.0230 = 0,023%)';
COMMENT ON COLUMN bancos.seguro_dfi     IS 'Alíquota DFI mensal em % sobre valor do imóvel (ex: 0.0066 = 0,0066%)';
