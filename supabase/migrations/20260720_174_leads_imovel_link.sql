-- Migration 174: Vinculação de imóvel ao Lead (referência + campos denormalizados editáveis)
-- Espelha 20260528_057_processos_imovel_link.sql, agora para leads.
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS imovel_id             UUID REFERENCES imoveis(id),
  ADD COLUMN IF NOT EXISTS imovel_matricula       TEXT,
  ADD COLUMN IF NOT EXISTS imovel_tipo            TEXT,
  ADD COLUMN IF NOT EXISTS imovel_categoria       TEXT,
  ADD COLUMN IF NOT EXISTS imovel_area_construida NUMERIC,
  ADD COLUMN IF NOT EXISTS imovel_area_terreno    NUMERIC,
  ADD COLUMN IF NOT EXISTS imovel_rua             TEXT,
  ADD COLUMN IF NOT EXISTS imovel_numero          TEXT,
  ADD COLUMN IF NOT EXISTS imovel_complemento     TEXT,
  ADD COLUMN IF NOT EXISTS imovel_bairro          TEXT,
  ADD COLUMN IF NOT EXISTS imovel_cidade          TEXT,
  ADD COLUMN IF NOT EXISTS imovel_uf              CHAR(2),
  ADD COLUMN IF NOT EXISTS imovel_registro_id     UUID REFERENCES registros_imoveis(id),
  ADD COLUMN IF NOT EXISTS nome_imovel            TEXT;

CREATE INDEX IF NOT EXISTS idx_leads_imovel_id ON leads(imovel_id) WHERE imovel_id IS NOT NULL;

-- Backfill: preserva os valores já digitados nos campos legados (migration 089)
-- nas novas colunas denormalizadas, sem criar linha em `imoveis` nem popular
-- imovel_id (não há dado suficiente pra isso — é só texto solto, não um imóvel
-- real cadastrado). COALESCE torna o comando seguro pra rodar mais de uma vez.
UPDATE leads
SET
  imovel_tipo   = COALESCE(imovel_tipo, tipo_imovel),
  imovel_cidade = COALESCE(imovel_cidade, cidade_imovel)
WHERE tipo_imovel IS NOT NULL
   OR cidade_imovel IS NOT NULL;
