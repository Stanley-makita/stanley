-- Migration 067: Adiciona telefone_whatsapp a usuarios
-- Separado do campo telefone (que é o ramal/fixo corporativo).
-- Usado pelo *Fonti para verificar se o remetente é funcionário interno.

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS telefone_whatsapp TEXT;
