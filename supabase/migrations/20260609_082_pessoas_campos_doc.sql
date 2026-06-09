-- Migration 082: campos de documentos em pessoas
-- data_emissao: data de emissão do doc de identidade (RG, CNH)
-- cidade_nascimento: naturalidade (RG, CNH)
-- registro_cnh, validade_cnh, primeira_habilitacao_cnh: campos específicos da CNH

ALTER TABLE pessoas
  ADD COLUMN IF NOT EXISTS data_emissao            DATE,
  ADD COLUMN IF NOT EXISTS cidade_nascimento        TEXT,
  ADD COLUMN IF NOT EXISTS registro_cnh             TEXT,
  ADD COLUMN IF NOT EXISTS validade_cnh             DATE,
  ADD COLUMN IF NOT EXISTS primeira_habilitacao_cnh DATE;
