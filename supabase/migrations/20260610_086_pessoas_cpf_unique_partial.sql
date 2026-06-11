-- Torna o UNIQUE de CPF em pessoas parcial (ignora registros com deleted_at)
-- Isso permite reutilizar CPFs de pessoas soft-deletadas sem conflito

-- Remove constraint inline criada na migration 024
ALTER TABLE pessoas DROP CONSTRAINT IF EXISTS pessoas_empresa_id_cpf_key;

-- Cria índice único parcial: só aplica UNIQUE para registros ativos
CREATE UNIQUE INDEX IF NOT EXISTS pessoas_empresa_cpf_ativo_unique
  ON pessoas (empresa_id, cpf)
  WHERE deleted_at IS NULL;
