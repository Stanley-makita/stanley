-- Migration 057: Vinculação de imóvel ao processo (referência + campos denormalizados editáveis)
ALTER TABLE processos
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
  ADD COLUMN IF NOT EXISTS imovel_registro_id     UUID REFERENCES registros_imoveis(id);

-- valor_imovel e nome_imovel já existem na tabela processos

CREATE INDEX idx_processos_imovel_id ON processos(imovel_id) WHERE imovel_id IS NOT NULL;
