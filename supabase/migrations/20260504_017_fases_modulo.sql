-- Migration: Adiciona campo modulo à tabela fases
-- Permite separar fases por módulo (leads, processos, etc.)

-- 1. Adiciona coluna modulo com default 'leads' (retrocompatível)
ALTER TABLE fases
  ADD COLUMN IF NOT EXISTS modulo TEXT NOT NULL DEFAULT 'leads';

-- 2. Cria índice para queries filtradas por módulo
CREATE INDEX IF NOT EXISTS idx_fases_empresa_modulo_ordem
  ON fases(empresa_id, modulo, ordem)
  WHERE ativo = TRUE;

-- 3. Atualiza RPC reordenar_fases para filtrar por módulo
CREATE OR REPLACE FUNCTION reordenar_fases(fases_input JSONB)
RETURNS VOID AS $$
BEGIN
  UPDATE fases f
  SET ordem = (item->>'ordem')::INTEGER,
      updated_at = NOW()
  FROM jsonb_array_elements(fases_input) AS item
  WHERE f.id = (item->>'id')::UUID
    AND f.empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Nota: fases existentes ficam com modulo = 'leads' (default).
-- Para que Processos também tenha suas fases, o admin deve criá-las
-- em Configurações → Fases → aba Processos.
