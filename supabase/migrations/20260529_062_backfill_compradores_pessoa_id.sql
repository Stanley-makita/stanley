-- Migration: Backfill processo_compradores.pessoa_id
-- A migration 20260507_024 linkava leads e conversas mas não compradores.
-- Esta migration resolve os registros históricos existentes.

-- 1. Linkar por CPF (chave mais confiável)
UPDATE processo_compradores pc
SET pessoa_id = p.id
FROM pessoas p
WHERE pc.pessoa_id IS NULL
  AND pc.empresa_id = p.empresa_id
  AND pc.cpf IS NOT NULL AND pc.cpf != ''
  AND p.cpf IS NOT NULL AND p.cpf != ''
  AND REGEXP_REPLACE(pc.cpf, '\D', '', 'g') = REGEXP_REPLACE(p.cpf, '\D', '', 'g');

-- 2. Linkar por nome exato quando CPF não disponível e nome é único na empresa
UPDATE processo_compradores pc
SET pessoa_id = p.id
FROM pessoas p
WHERE pc.pessoa_id IS NULL
  AND pc.empresa_id = p.empresa_id
  AND (pc.cpf IS NULL OR pc.cpf = '')
  AND LOWER(TRIM(pc.nome)) = LOWER(TRIM(p.nome))
  AND (
    SELECT COUNT(*)
    FROM pessoas p2
    WHERE p2.empresa_id = pc.empresa_id
      AND LOWER(TRIM(p2.nome)) = LOWER(TRIM(pc.nome))
  ) = 1;
