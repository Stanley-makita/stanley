-- ============================================================
-- Migration: 20260630_145_documentos_backfill_compradores.sql
-- Sprint Inteligência Documental — Fase D (complemento)
-- A migration 144 só resolveu pessoa_id via comprador PRINCIPAL do
-- processo. Esta passada tenta os documentos que ficaram de fora por
-- causa disso, agora aceitando QUALQUER comprador do processo que já
-- tenha pessoa_id (preferindo o principal quando houver mais de um).
-- Continua sem fuzzy match de CPF/nome — só relaxa o filtro `principal`.
-- ============================================================

BEGIN;

INSERT INTO documentos (
  id, empresa_id, dominio, pessoa_id, processo_id, catalogo_tipo_id,
  classificacao_legado, nome_original, nome_exibicao, mime_type, tamanho_bytes,
  storage_bucket, storage_path, origem, status_ocr, permanente,
  validade_data, validade_dias, recebido_em, deleted_at
)
SELECT
  dc.id,
  dc.empresa_id,
  'acervo_documental',
  comprador.pessoa_id,
  NULL,
  cat.id,
  dc.classificacao,
  dc.nome_original,
  dc.nome_exibicao,
  dc.mime_type,
  dc.tamanho_bytes,
  dc.storage_bucket,
  dc.storage_path,
  dc.canal_origem,
  dc.ocr_status,
  dc.permanente,
  dc.validade_data,
  dc.validade_dias,
  dc.created_at,
  dc.deleted_at
FROM documentos_clientes dc
LEFT JOIN catalogo_tipos_documento cat ON cat.codigo = dc.classificacao
JOIN LATERAL (
  SELECT pessoa_id FROM processo_compradores
  WHERE processo_id = dc.processo_id AND pessoa_id IS NOT NULL
  ORDER BY principal DESC
  LIMIT 1
) comprador ON true
WHERE dc.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM documentos d WHERE d.id = dc.id);

-- Vínculo a Processo para os que acabaram de entrar
INSERT INTO documento_vinculos (empresa_id, documento_id, entidade_tipo, entidade_id, vinculado_em)
SELECT dc.empresa_id, dc.id, 'processo', dc.processo_id, dc.created_at
FROM documentos_clientes dc
JOIN documentos d ON d.id = dc.id
WHERE dc.processo_id IS NOT NULL
ON CONFLICT DO NOTHING;

COMMIT;
