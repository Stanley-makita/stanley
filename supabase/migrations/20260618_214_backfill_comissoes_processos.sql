-- Migration 214: Preenche comissao_comercial e comissao_empresa
-- em processos existentes que tenham banco_id mas comissoes nulas

UPDATE processos p
SET
  comissao_comercial = cp.comissao_comercial,
  comissao_empresa   = cp.comissao_empresa
FROM comissoes_padrao cp
WHERE cp.banco_id    = p.banco_id
  AND cp.empresa_id  = p.empresa_id
  AND p.banco_id    IS NOT NULL
  AND (p.comissao_comercial IS NULL OR p.comissao_empresa IS NULL);
