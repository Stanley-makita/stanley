-- Migration 118: Tabela de documentos de identidade por pessoa
-- Cada documento tem seus próprios campos evitando sobrescrita entre tipos.
-- pessoas continua com campos flat como espelho/compat até migração futura.

CREATE TYPE tipo_documento_pessoa AS ENUM (
  'rg', 'cnh', 'cpf', 'certidao_nascimento', 'certidao_casamento',
  'passaporte', 'rne', 'outro'
);

CREATE TABLE IF NOT EXISTS pessoa_documentos_identificacao (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id                UUID        NOT NULL REFERENCES empresas(id),
  pessoa_id                 UUID        NOT NULL REFERENCES pessoas(id) ON DELETE CASCADE,
  tipo_documento            tipo_documento_pessoa NOT NULL,
  -- campos comuns a vários tipos
  numero                    TEXT,
  orgao_emissor             TEXT,
  uf_emissor                CHAR(2),
  data_emissao              DATE,
  data_validade             DATE,
  -- CNH específico
  data_primeira_habilitacao DATE,
  -- certidão específico
  cartorio                  TEXT,
  matricula                 TEXT,
  livro                     TEXT,
  folha                     TEXT,
  termo                     TEXT,
  cidade_emissao            TEXT,
  uf_emissao                CHAR(2),
  -- auditoria / origem OCR
  payload_ocr               JSONB,
  documento_cliente_id      UUID        REFERENCES documentos_clientes(id),
  criado_em                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pessoa_id, tipo_documento)
);

CREATE INDEX IF NOT EXISTS idx_pessoa_docs_pessoa  ON pessoa_documentos_identificacao(pessoa_id);
CREATE INDEX IF NOT EXISTS idx_pessoa_docs_empresa ON pessoa_documentos_identificacao(empresa_id);

-- trigger: atualiza atualizado_em automaticamente em qualquer UPDATE
CREATE OR REPLACE FUNCTION atualizar_pessoa_doc_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pessoa_docs_atualizado_em
  BEFORE UPDATE ON pessoa_documentos_identificacao
  FOR EACH ROW EXECUTE FUNCTION atualizar_pessoa_doc_timestamp();

-- RLS: visível apenas para usuários da mesma empresa
ALTER TABLE pessoa_documentos_identificacao ENABLE ROW LEVEL SECURITY;

CREATE POLICY pessoa_docs_empresa ON pessoa_documentos_identificacao
  USING (
    empresa_id IN (
      SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid()
    )
  );
