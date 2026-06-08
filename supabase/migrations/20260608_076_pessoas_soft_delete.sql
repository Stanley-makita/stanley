-- Soft-delete para pessoas (exclusão lógica com motivo)
ALTER TABLE pessoas ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE pessoas ADD COLUMN IF NOT EXISTS motivo_exclusao TEXT;
