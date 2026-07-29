-- Permite tipo='consorcio' em simulacoes_central (Central de Simulações).
ALTER TABLE simulacoes_central DROP CONSTRAINT IF EXISTS simulacoes_central_tipo_check;
ALTER TABLE simulacoes_central ADD CONSTRAINT simulacoes_central_tipo_check
  CHECK (tipo IN ('custas', 'financiamento', 'consorcio'));
