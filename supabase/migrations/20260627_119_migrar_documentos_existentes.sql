-- Migration 119: Migrar dados existentes de pessoas para pessoa_documentos_identificacao
--
-- Estratégia:
--  - orgao_emissor e data_emissao flat eram usados majoritariamente para RG → vão para o card RG
--  - CNH recebe apenas seus campos exclusivos (sem orgao_emissor flat — ambíguo)
--  - Certidões não existiam como campos → sem migração (nascem zeradas)
--  - ON CONFLICT DO NOTHING → seguro para re-rodar

-- Migrar RG
-- (rg OU orgao_emissor OU data_emissao preenchidos)
INSERT INTO pessoa_documentos_identificacao
  (empresa_id, pessoa_id, tipo_documento, numero, orgao_emissor, data_emissao)
SELECT
  empresa_id,
  id,
  'rg',
  rg,
  orgao_emissor,
  data_emissao
FROM pessoas
WHERE deleted_at IS NULL
  AND (
    rg           IS NOT NULL OR
    orgao_emissor IS NOT NULL OR
    data_emissao  IS NOT NULL
  )
ON CONFLICT (pessoa_id, tipo_documento) DO NOTHING;

-- Migrar CNH
-- (registro_cnh OU validade_cnh OU primeira_habilitacao_cnh preenchidos)
-- orgao_emissor NÃO é copiado pois era do RG no campo flat
-- data_emissao NÃO é copiada pois pertence ao RG
INSERT INTO pessoa_documentos_identificacao
  (empresa_id, pessoa_id, tipo_documento, numero, data_validade, data_primeira_habilitacao)
SELECT
  empresa_id,
  id,
  'cnh',
  registro_cnh,
  validade_cnh,
  primeira_habilitacao_cnh
FROM pessoas
WHERE deleted_at IS NULL
  AND (
    registro_cnh          IS NOT NULL OR
    validade_cnh          IS NOT NULL OR
    primeira_habilitacao_cnh IS NOT NULL
  )
ON CONFLICT (pessoa_id, tipo_documento) DO NOTHING;
