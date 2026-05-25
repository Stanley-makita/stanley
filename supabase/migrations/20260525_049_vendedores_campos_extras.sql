-- Migration: novos campos no formulário de vendedores
-- Adiciona dados bancários, estado civil e dados do cônjuge

ALTER TABLE processo_vendedores
  ADD COLUMN IF NOT EXISTS banco             TEXT,
  ADD COLUMN IF NOT EXISTS agencia           TEXT,
  ADD COLUMN IF NOT EXISTS conta             TEXT,
  ADD COLUMN IF NOT EXISTS estado_civil      TEXT,
  ADD COLUMN IF NOT EXISTS conjuge_nome      TEXT,
  ADD COLUMN IF NOT EXISTS conjuge_cpf       TEXT,
  ADD COLUMN IF NOT EXISTS conjuge_rg        TEXT,
  ADD COLUMN IF NOT EXISTS conjuge_data_nasc DATE,
  ADD COLUMN IF NOT EXISTS conjuge_papel     TEXT; -- 'conjuge' | 'proprietario'
