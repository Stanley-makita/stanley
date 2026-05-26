-- Migration: Corrigir constraint UNIQUE de fases para incluir modulo
-- Sem isso, nomes iguais em módulos diferentes (ex: "Novo" em Leads e Fila Operacional) falham.

-- 1. Remove a constraint antiga (empresa_id, nome)
ALTER TABLE fases
  DROP CONSTRAINT IF EXISTS fases_nome_empresa_uq;

-- 2. Cria nova constraint incluindo modulo
ALTER TABLE fases
  ADD CONSTRAINT fases_nome_empresa_modulo_uq UNIQUE (empresa_id, modulo, nome);
