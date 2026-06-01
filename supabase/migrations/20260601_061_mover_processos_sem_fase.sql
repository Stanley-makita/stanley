-- Migration: mover processos sem fase para a primeira fase do respectivo módulo
-- Financiamento/CGI → primeira fase do módulo 'processos'
-- Consórcio → primeira fase do módulo 'consorcio'
-- Contrato → primeira fase do módulo 'contrato'
-- Registro → primeira fase do módulo 'registro'

UPDATE processos p
SET fase_atual_id = (
  SELECT f.id FROM fases f
  WHERE f.empresa_id = p.empresa_id
    AND f.modulo = 'processos'
    AND f.ativo = true
  ORDER BY f.ordem ASC
  LIMIT 1
)
WHERE p.fase_atual_id IS NULL
  AND p.modalidade IN ('SFI', 'SBPE', 'PMCMV', 'Pro_Cotista', 'CGI')
  AND p.deleted_at IS NULL;

UPDATE processos p
SET fase_atual_id = (
  SELECT f.id FROM fases f
  WHERE f.empresa_id = p.empresa_id
    AND f.modulo = 'consorcio'
    AND f.ativo = true
  ORDER BY f.ordem ASC
  LIMIT 1
)
WHERE p.fase_atual_id IS NULL
  AND p.modalidade = 'Consorcio'
  AND p.deleted_at IS NULL;

UPDATE processos p
SET fase_atual_id = (
  SELECT f.id FROM fases f
  WHERE f.empresa_id = p.empresa_id
    AND f.modulo = 'contrato'
    AND f.ativo = true
  ORDER BY f.ordem ASC
  LIMIT 1
)
WHERE p.fase_atual_id IS NULL
  AND p.modalidade = 'Contrato'
  AND p.deleted_at IS NULL;

UPDATE processos p
SET fase_atual_id = (
  SELECT f.id FROM fases f
  WHERE f.empresa_id = p.empresa_id
    AND f.modulo = 'registro'
    AND f.ativo = true
  ORDER BY f.ordem ASC
  LIMIT 1
)
WHERE p.fase_atual_id IS NULL
  AND p.modalidade = 'Registro'
  AND p.deleted_at IS NULL;
