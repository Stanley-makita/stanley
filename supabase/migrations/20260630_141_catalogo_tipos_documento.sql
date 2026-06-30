-- ============================================================
-- Migration: 20260630_141_catalogo_tipos_documento.sql
-- Sprint Inteligência Documental — Fase A (Catálogo)
-- Cria o catálogo de tipos de documento, eliminando os arrays
-- hardcoded espalhados em componentes. Não toca em dado existente
-- (consumo aditivo — ver docs/arquitetura-documental-fonti.md).
-- ============================================================

CREATE TABLE catalogo_tipos_documento (
  id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo                   TEXT         NOT NULL UNIQUE,
  nome                     TEXT         NOT NULL,
  grupo                    TEXT         NOT NULL
                                        CHECK (grupo IN ('identificacao', 'comprovante', 'financeiro', 'juridico', 'geral')),
  dominio_permitido        TEXT[]       NOT NULL DEFAULT ARRAY['acervo_documental']
                                        CHECK (dominio_permitido <@ ARRAY['acervo_documental', 'processo_trabalho']::TEXT[]),
  permanente               BOOLEAN      NOT NULL DEFAULT false,
  validade_dias            INTEGER,
  permite_ocr              BOOLEAN      NOT NULL DEFAULT false,
  permite_compartilhamento BOOLEAN      NOT NULL DEFAULT true,
  gera_formulario          BOOLEAN      NOT NULL DEFAULT false,
  utilizado_pelo_normi     BOOLEAN      NOT NULL DEFAULT true,
  obrigatorio_por_operacao JSONB,
  schema_extracao          JSONB,
  ordem_exibicao           INTEGER      NOT NULL DEFAULT 0,
  ativo                    BOOLEAN      NOT NULL DEFAULT true,
  icone                    TEXT,
  criado_em                TIMESTAMPTZ  NOT NULL DEFAULT now(),
  atualizado_em            TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_catalogo_tipos_documento_ativo ON catalogo_tipos_documento (ativo, ordem_exibicao);

CREATE OR REPLACE FUNCTION fn_catalogo_tipos_documento_atualizado_em()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_catalogo_tipos_documento_atualizado_em
  BEFORE UPDATE ON catalogo_tipos_documento
  FOR EACH ROW EXECUTE FUNCTION fn_catalogo_tipos_documento_atualizado_em();

-- Catálogo é global (não multi-tenant): a taxonomia de documentos é a
-- mesma para todas as empresas que usam o Fonti. Leitura liberada para
-- qualquer usuário autenticado; escrita fica restrita a service role até
-- definirmos a governança (admin/gestor) — ver "Pendente de decisão" no
-- documento de arquitetura.
ALTER TABLE catalogo_tipos_documento ENABLE ROW LEVEL SECURITY;

CREATE POLICY "usuarios_autenticados_leem_catalogo"
  ON catalogo_tipos_documento FOR SELECT
  TO authenticated
  USING (ativo = true);

-- Seed: tipos já em uso hoje nos componentes (AbaDocumentos de processo/lead,
-- DocumentoOcrRevisaoModal, enum tipo_documento_pessoa) + tipos já referenciados
-- na lógica de validade (src/lib/documentos.ts) mas ainda sem dropdown próprio.
INSERT INTO catalogo_tipos_documento
  (codigo, nome, grupo, dominio_permitido, permanente, validade_dias, permite_ocr, gera_formulario, utilizado_pelo_normi, ordem_exibicao)
VALUES
  ('rg',                   'RG',                          'identificacao', ARRAY['acervo_documental'], true,  NULL, true,  true,  true,  10),
  ('cnh',                  'CNH',                         'identificacao', ARRAY['acervo_documental'], false, NULL, true,  true,  true,  20),
  ('cpf',                  'CPF',                         'identificacao', ARRAY['acervo_documental'], true,  NULL, true,  true,  true,  30),
  ('certidao_nascimento',  'Certidão de Nascimento',      'identificacao', ARRAY['acervo_documental'], false, NULL, true,  true,  true,  40),
  ('certidao_casamento',   'Certidão de Casamento',       'identificacao', ARRAY['acervo_documental'], false, NULL, true,  true,  true,  50),
  ('certidao_divorcio',    'Certidão de Divórcio',        'identificacao', ARRAY['acervo_documental'], false, NULL, false, false, true,  60),
  ('passaporte',           'Passaporte',                  'identificacao', ARRAY['acervo_documental'], false, NULL, false, false, true,  70),
  ('rne',                  'RNE',                         'identificacao', ARRAY['acervo_documental'], false, NULL, false, false, true,  80),
  ('comprovante_renda',    'Comprovante de Renda',        'comprovante',   ARRAY['acervo_documental'], false, 60,   true,  false, true,  90),
  ('comprovante_endereco', 'Comprovante de Endereço',     'comprovante',   ARRAY['acervo_documental'], false, 90,   true,  false, true,  100),
  ('extrato_bancario',     'Extrato Bancário',            'financeiro',    ARRAY['acervo_documental'], false, 60,   true,  true,  true,  110),
  ('extrato_fgts',         'Extrato FGTS',                'financeiro',    ARRAY['acervo_documental'], false, 90,   true,  true,  true,  120),
  ('imposto_renda',        'Imposto de Renda',            'financeiro',    ARRAY['acervo_documental'], false, 365,  false, false, true,  130),
  ('matricula',            'Matrícula do Imóvel',         'juridico',      ARRAY['processo_trabalho'], false, NULL, false, false, true,  140),
  ('contrato',             'Contrato',                    'juridico',      ARRAY['processo_trabalho'], false, NULL, false, false, true,  150),
  ('outro',                'Outro',                       'geral',         ARRAY['acervo_documental', 'processo_trabalho'], false, NULL, false, false, false, 999);
