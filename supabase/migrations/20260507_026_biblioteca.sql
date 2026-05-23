-- Migration: Biblioteca interna da empresa (Base de Conhecimento)
-- Propósito: repositório de normativos, manuais, modelos e materiais internos.
-- NÃO armazena documentos de clientes — esses ficam em processo_documentos.

-- ── Categorias ────────────────────────────────────────────────────────────────
CREATE TABLE base_conhecimento_categorias (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID        NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
  nome        TEXT        NOT NULL,
  icone       TEXT        NOT NULL DEFAULT 'FolderOpen',
  cor         TEXT        NOT NULL DEFAULT '#6B7280',
  ordem       INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE base_conhecimento_categorias ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_bk_categorias_empresa ON base_conhecimento_categorias(empresa_id, ordem);

CREATE TRIGGER bk_categorias_updated_at
  BEFORE UPDATE ON base_conhecimento_categorias
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE POLICY "bk_categorias_select" ON base_conhecimento_categorias
  FOR SELECT USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
  );
CREATE POLICY "bk_categorias_write" ON base_conhecimento_categorias
  FOR ALL USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
    AND (SELECT perfil FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1) IN ('admin', 'gerente')
  );
CREATE POLICY "bk_categorias_service" ON base_conhecimento_categorias
  FOR ALL TO service_role USING (true);

-- ── Tipo de item ──────────────────────────────────────────────────────────────
CREATE TYPE bk_tipo AS ENUM (
  'arquivo',  -- PDF, DOCX, XLSX, etc. armazenado no Supabase Storage
  'link',     -- URL externa (manual do banco, normativo online)
  'texto'     -- conteúdo em Markdown editado diretamente no CRM
);

-- ── Documentos da biblioteca ──────────────────────────────────────────────────
CREATE TABLE base_conhecimento_docs (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            UUID        NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
  categoria_id          UUID        REFERENCES base_conhecimento_categorias(id) ON DELETE SET NULL,
  titulo                TEXT        NOT NULL,
  descricao             TEXT,
  tipo                  bk_tipo     NOT NULL DEFAULT 'arquivo',

  -- Conteúdo: apenas um dos três abaixo é preenchido conforme o tipo
  conteudo              TEXT,                  -- markdown quando tipo='texto'
  arquivo_url           TEXT,                  -- URL pública/storage quando tipo='arquivo'
  arquivo_nome          TEXT,                  -- nome original do arquivo
  arquivo_tamanho_kb    INTEGER,
  link_url              TEXT,                  -- URL externa quando tipo='link'

  tags                  TEXT[]      NOT NULL DEFAULT '{}',
  publicado             BOOLEAN     NOT NULL DEFAULT false,
  publicado_por         UUID        REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at            TIMESTAMPTZ
);

ALTER TABLE base_conhecimento_docs ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_bk_docs_empresa       ON base_conhecimento_docs(empresa_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_bk_docs_categoria     ON base_conhecimento_docs(categoria_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_bk_docs_publicado     ON base_conhecimento_docs(empresa_id, publicado) WHERE deleted_at IS NULL;
CREATE INDEX idx_bk_docs_tags          ON base_conhecimento_docs USING GIN(tags);

CREATE TRIGGER bk_docs_updated_at
  BEFORE UPDATE ON base_conhecimento_docs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Toda a equipe vê documentos publicados; rascunhos apenas admin/gerente
CREATE POLICY "bk_docs_select_publicado" ON base_conhecimento_docs
  FOR SELECT USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
    AND deleted_at IS NULL
    AND (
      publicado = true
      OR (SELECT perfil FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1) IN ('admin', 'gerente')
    )
  );
CREATE POLICY "bk_docs_write" ON base_conhecimento_docs
  FOR ALL USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
    AND (SELECT perfil FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1) IN ('admin', 'gerente')
  );
CREATE POLICY "bk_docs_service" ON base_conhecimento_docs
  FOR ALL TO service_role USING (true);

-- ── Seed: categorias padrão para Fontinhas Assessoria ────────────────────────
-- Inserido apenas se a empresa_id existir (via trigger ou seed manual)
-- Deixamos vazio para a empresa configurar conforme necessidade.
-- Sugestões de categorias a criar via UI:
--   Normativos Caixa | Normativos Outros Bancos | Manuais Internos
--   Modelos de Documentos | Checklists | Treinamentos | Comunicados
