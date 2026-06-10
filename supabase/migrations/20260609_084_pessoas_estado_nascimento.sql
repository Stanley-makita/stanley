-- Migration 084: campo estado_nascimento (UF de nascimento)
ALTER TABLE pessoas ADD COLUMN IF NOT EXISTS estado_nascimento TEXT;
