-- Adiciona campo para registrar o motivo da exclusão de um lead (soft-delete)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS motivo_exclusao TEXT;
