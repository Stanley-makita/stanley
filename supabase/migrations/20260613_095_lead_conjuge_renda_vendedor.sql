-- 095: renda do cônjuge e dados básicos do vendedor no lead
-- Permite exibir renda comprador+cônjuge lado a lado e registrar vendedor antes de criar processo

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS conjuge_renda_formal   NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS conjuge_renda_informal NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS vendedor_nome          TEXT,
  ADD COLUMN IF NOT EXISTS vendedor_cpf           TEXT,
  ADD COLUMN IF NOT EXISTS vendedor_telefone      TEXT;
