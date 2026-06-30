-- ============================================================
-- Migration: 20260630_144_documentos_unificado.sql
-- Sprint Inteligência Documental — Fase D (Modelo unificado + vínculos)
-- Cria `documentos` (dono único: Pessoa para Acervo Documental, Processo
-- para Documentos do Processo) e `documento_vinculos` (reuso N:N), e
-- popula a partir de documentos_clientes + processo_documentos.
--
-- IMPORTANTE: esta migration é SOMENTE ADITIVA.
-- - documentos_clientes e processo_documentos continuam existindo,
--   intactas, e seguem sendo a fonte de leitura/escrita de todo o
--   frontend/API até a Fase E ("corte de leitura").
-- - Nenhum componente ou rota foi alterado para ler `documentos` ainda.
-- Ver docs/arquitetura-documental-fonti.md, seções 1.1, 1.5, 3 e 5.
-- ============================================================

BEGIN;

CREATE TABLE documentos (
  id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id               UUID         NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  dominio                  TEXT         NOT NULL
                                        CHECK (dominio IN ('acervo_documental', 'processo_trabalho')),
  pessoa_id                UUID         REFERENCES pessoas(id) ON DELETE SET NULL,
  processo_id              UUID         REFERENCES processos(id) ON DELETE CASCADE,
  catalogo_tipo_id         UUID         REFERENCES catalogo_tipos_documento(id),
  classificacao_legado     TEXT,
  nome_original            TEXT         NOT NULL,
  nome_exibicao            TEXT,
  mime_type                TEXT,
  tamanho_bytes            BIGINT,
  storage_bucket           TEXT         NOT NULL,
  storage_path             TEXT         NOT NULL,
  origem                   TEXT         NOT NULL DEFAULT 'upload_manual',
  status_ocr               TEXT,
  permanente               BOOLEAN      DEFAULT false,
  validade_data            DATE,
  validade_dias            INTEGER,
  recebido_em              TIMESTAMPTZ  NOT NULL DEFAULT now(),
  substituido_por_id       UUID         REFERENCES documentos(id) ON DELETE SET NULL,
  deleted_at               TIMESTAMPTZ,
  -- Traceability: só preenchido para documentos migrados de processo_documentos
  -- (documentos de dominio=acervo_documental migrados de documentos_clientes
  -- mantêm o MESMO id da linha de origem — id já é o ponteiro).
  legado_processo_documento_id UUID,
  CHECK (
    (dominio = 'acervo_documental' AND pessoa_id IS NOT NULL AND processo_id IS NULL)
    OR
    (dominio = 'processo_trabalho' AND processo_id IS NOT NULL)
  )
);

CREATE INDEX idx_documentos_pessoa    ON documentos (pessoa_id)   WHERE pessoa_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_documentos_processo  ON documentos (processo_id) WHERE processo_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_documentos_empresa   ON documentos (empresa_id, recebido_em DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_documentos_dominio   ON documentos (dominio);

ALTER TABLE documentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "documentos_select" ON documentos FOR SELECT
  USING (empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() AND ativo = true LIMIT 1));
CREATE POLICY "documentos_insert" ON documentos FOR INSERT
  WITH CHECK (empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() AND ativo = true LIMIT 1));
CREATE POLICY "documentos_update" ON documentos FOR UPDATE
  USING (empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() AND ativo = true LIMIT 1));
CREATE POLICY "documentos_service" ON documentos FOR ALL TO service_role USING (true);

CREATE TABLE documento_vinculos (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID         NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  documento_id  UUID         NOT NULL REFERENCES documentos(id) ON DELETE CASCADE,
  entidade_tipo TEXT         NOT NULL CHECK (entidade_tipo IN ('lead', 'processo')),
  entidade_id   UUID         NOT NULL,
  vinculado_em  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  vinculado_por UUID         REFERENCES usuarios(id) ON DELETE SET NULL,
  UNIQUE (documento_id, entidade_tipo, entidade_id)
);

CREATE INDEX idx_documento_vinculos_documento ON documento_vinculos (documento_id);
CREATE INDEX idx_documento_vinculos_entidade  ON documento_vinculos (entidade_tipo, entidade_id);

ALTER TABLE documento_vinculos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "documento_vinculos_select" ON documento_vinculos FOR SELECT
  USING (empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() AND ativo = true LIMIT 1));
CREATE POLICY "documento_vinculos_insert" ON documento_vinculos FOR INSERT
  WITH CHECK (empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() AND ativo = true LIMIT 1));
CREATE POLICY "documento_vinculos_service" ON documento_vinculos FOR ALL TO service_role USING (true);

-- ============================================================
-- Backfill: documentos_clientes → documentos (dominio=acervo_documental)
-- ============================================================
-- pessoa_id resolvido por 3 caminhos exatos (sem fuzzy match em massa,
-- por segurança): direto no documento → via lead → via comprador
-- principal do processo. Documentos cujo pessoa_id não resolve por
-- nenhum desses caminhos NÃO são migrados nesta passada — continuam
-- acessíveis via documentos_clientes e ficam pendentes de resolução
-- manual antes da Fase E.

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
  COALESCE(dc.pessoa_id, lead_pessoa.pessoa_id, comprador.pessoa_id),
  NULL,  -- processo_id direto não é usado em acervo_documental; vínculo cuida disso
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
LEFT JOIN LATERAL (
  SELECT pessoa_id FROM leads WHERE id = dc.lead_id AND pessoa_id IS NOT NULL
) lead_pessoa ON true
LEFT JOIN LATERAL (
  SELECT pessoa_id FROM processo_compradores
  WHERE processo_id = dc.processo_id AND principal = true AND pessoa_id IS NOT NULL
  LIMIT 1
) comprador ON true
LEFT JOIN catalogo_tipos_documento cat ON cat.codigo = dc.classificacao
WHERE COALESCE(dc.pessoa_id, lead_pessoa.pessoa_id, comprador.pessoa_id) IS NOT NULL;

-- ============================================================
-- Backfill: processo_documentos → documentos (dominio=processo_trabalho)
-- ============================================================
-- Sem classificação hoje (uploads livres do operador) → catalogo_tipo_id
-- fica NULL; bucket é fixo 'documentos' (não há coluna própria na origem).

INSERT INTO documentos (
  empresa_id, dominio, processo_id, nome_original, mime_type, tamanho_bytes,
  storage_bucket, storage_path, origem, recebido_em, legado_processo_documento_id
)
SELECT
  pd.empresa_id,
  'processo_trabalho',
  pd.processo_id,
  pd.nome,
  pd.mime_type,
  pd.tamanho,
  'documentos',
  pd.storage_path,
  'upload_manual',
  pd.criado_em,
  pd.id
FROM processo_documentos pd;

-- ============================================================
-- Backfill: documento_vinculos
-- ============================================================

-- Vínculos diretos a Lead (documentos_clientes.lead_id)
INSERT INTO documento_vinculos (empresa_id, documento_id, entidade_tipo, entidade_id, vinculado_em)
SELECT dc.empresa_id, dc.id, 'lead', dc.lead_id, dc.created_at
FROM documentos_clientes dc
JOIN documentos d ON d.id = dc.id
WHERE dc.lead_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Vínculos diretos a Processo (documentos_clientes.processo_id)
INSERT INTO documento_vinculos (empresa_id, documento_id, entidade_tipo, entidade_id, vinculado_em)
SELECT dc.empresa_id, dc.id, 'processo', dc.processo_id, dc.created_at
FROM documentos_clientes dc
JOIN documentos d ON d.id = dc.id
WHERE dc.processo_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Vínculos vindos da junction table existente (reuso entre processos)
INSERT INTO documento_vinculos (empresa_id, documento_id, entidade_tipo, entidade_id, vinculado_em, vinculado_por)
SELECT dpv.empresa_id, dpv.documento_id, 'processo', dpv.processo_id, dpv.vinculado_em, dpv.vinculado_por
FROM documento_processo_vinculos dpv
JOIN documentos d ON d.id = dpv.documento_id
ON CONFLICT DO NOTHING;

COMMIT;
