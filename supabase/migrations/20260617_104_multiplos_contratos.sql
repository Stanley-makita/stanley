-- Remove a restrição de único contrato por processo
ALTER TABLE processo_contratos
  DROP CONSTRAINT IF EXISTS uq_contrato_por_processo;

-- Adiciona coluna de versão para controlar múltiplas versões por processo
ALTER TABLE processo_contratos
  ADD COLUMN IF NOT EXISTS versao INTEGER NOT NULL DEFAULT 1;
