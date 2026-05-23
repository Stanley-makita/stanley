-- Migration: adiciona campos detalhados ao lead
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS rg TEXT,
  ADD COLUMN IF NOT EXISTS data_nascimento DATE,
  ADD COLUMN IF NOT EXISTS profissao TEXT,
  ADD COLUMN IF NOT EXISTS estado_civil TEXT CHECK (estado_civil IN ('solteiro','casado','uniao_estavel','divorciado','viuvo')),
  ADD COLUMN IF NOT EXISTS regime_casamento TEXT,
  ADD COLUMN IF NOT EXISTS conjuge_nome TEXT,
  ADD COLUMN IF NOT EXISTS conjuge_cpf TEXT,
  ADD COLUMN IF NOT EXISTS conjuge_data_nascimento DATE,
  ADD COLUMN IF NOT EXISTS renda_formal NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS renda_informal NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS produto_interesse TEXT,
  ADD COLUMN IF NOT EXISTS ultimo_contato TIMESTAMPTZ;
