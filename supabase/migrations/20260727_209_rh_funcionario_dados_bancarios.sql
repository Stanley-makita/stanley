-- Migration 209: PIS + Dados Bancários do funcionário (RH)
--
-- Cadastro informativo (PIX, banco, agência, conta, tipo de conta, PIS),
-- reunido junto com Dados Gerais e Benefícios na "Ficha" do funcionário.

ALTER TABLE rh_funcionarios
  ADD COLUMN IF NOT EXISTS pis        TEXT,
  ADD COLUMN IF NOT EXISTS banco_nome TEXT,
  ADD COLUMN IF NOT EXISTS agencia    TEXT,
  ADD COLUMN IF NOT EXISTS conta      TEXT,
  ADD COLUMN IF NOT EXISTS tipo_conta TEXT CHECK (tipo_conta IN ('corrente', 'poupanca', 'salario')),
  ADD COLUMN IF NOT EXISTS chave_pix  TEXT;
