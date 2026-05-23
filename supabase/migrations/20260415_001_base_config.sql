-- ============================================================
-- Migration: Base Config Module (Fundação do Sistema Credifon)
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TYPE usuario_perfil AS ENUM (
  'admin', 'gerente', 'analista', 'consultor', 'cliente'
);

-- ============================================================
-- TABELA: empresas
-- ============================================================
CREATE TABLE empresas (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       TEXT        NOT NULL,
  cnpj       TEXT        UNIQUE,
  telefone   TEXT,
  email      TEXT,
  logo_url   TEXT,
  site       TEXT,
  ativo      BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER empresas_updated_at
  BEFORE UPDATE ON empresas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE empresas ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- TABELA: usuarios (criada ANTES das policies de empresas)
-- ============================================================
CREATE TABLE usuarios (
  id          UUID           PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  empresa_id  UUID           NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
  nome        TEXT           NOT NULL,
  email       TEXT           NOT NULL,
  telefone    TEXT,
  avatar_url  TEXT,
  perfil      usuario_perfil NOT NULL DEFAULT 'analista',
  ativo       BOOLEAN        NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

CREATE INDEX idx_usuarios_empresa ON usuarios(empresa_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_usuarios_email   ON usuarios(email)      WHERE deleted_at IS NULL;

CREATE TRIGGER usuarios_updated_at
  BEFORE UPDATE ON usuarios
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- POLICIES: empresas (agora que usuarios existe)
-- ============================================================
CREATE POLICY "empresas_select" ON empresas
  FOR SELECT USING (
    id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid())
  );

CREATE POLICY "empresas_update" ON empresas
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE id = auth.uid() AND perfil = 'admin' AND empresa_id = empresas.id
    )
  );

-- ============================================================
-- POLICIES: usuarios
-- ============================================================
CREATE POLICY "usuarios_select" ON usuarios
  FOR SELECT USING (
    deleted_at IS NULL AND (
      id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM usuarios u
        WHERE u.id = auth.uid()
          AND u.empresa_id = usuarios.empresa_id
          AND u.perfil IN ('admin', 'gerente', 'analista')
      )
    )
  );

CREATE POLICY "usuarios_insert" ON usuarios
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE id = auth.uid() AND perfil = 'admin'
    )
  );

CREATE POLICY "usuarios_update" ON usuarios
  FOR UPDATE USING (
    id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM usuarios WHERE id = auth.uid() AND perfil = 'admin'
    )
  );

-- ============================================================
-- TABELA: fases
-- ============================================================
CREATE TABLE fases (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        UUID        NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
  nome              TEXT        NOT NULL,
  descricao         TEXT,
  ordem             INTEGER     NOT NULL,
  cor               TEXT        NOT NULL DEFAULT '#C2AA6A',
  icone             TEXT,
  prazo_dias        INTEGER,
  notificar_cliente BOOLEAN     NOT NULL DEFAULT TRUE,
  mensagem_cliente  TEXT,
  ativo             BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ,
  CONSTRAINT fases_nome_empresa_uq UNIQUE (empresa_id, nome)
);

CREATE INDEX idx_fases_empresa_ordem ON fases(empresa_id, ordem) WHERE ativo = TRUE;

CREATE OR REPLACE FUNCTION reordenar_fases(fases_input JSONB)
RETURNS VOID AS $$
BEGIN
  UPDATE fases f
  SET ordem = (item->>'ordem')::INTEGER,
      updated_at = NOW()
  FROM jsonb_array_elements(fases_input) AS item
  WHERE f.id = (item->>'id')::UUID
    AND f.empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER fases_updated_at
  BEFORE UPDATE ON fases
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE fases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fases_select" ON fases
  FOR SELECT USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid())
  );

CREATE POLICY "fases_insert" ON fases
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE id = auth.uid() AND perfil IN ('admin', 'gerente')
    )
  );

CREATE POLICY "fases_update" ON fases
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE id = auth.uid() AND perfil IN ('admin', 'gerente')
    )
  );

-- ============================================================
-- TABELA: bancos
-- ============================================================
CREATE TABLE bancos (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID         NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
  nome          TEXT         NOT NULL,
  codigo        TEXT,
  logo_url      TEXT,
  taxa_minima   NUMERIC(5,3),
  taxa_maxima   NUMERIC(5,3),
  prazo_maximo  INTEGER,
  ativo         BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT bancos_taxa_check CHECK (taxa_minima <= taxa_maxima OR taxa_maxima IS NULL)
);

CREATE INDEX idx_bancos_empresa ON bancos(empresa_id) WHERE ativo = TRUE;

CREATE TRIGGER bancos_updated_at
  BEFORE UPDATE ON bancos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE bancos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bancos_select" ON bancos
  FOR SELECT USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid())
  );

CREATE POLICY "bancos_insert" ON bancos
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND perfil IN ('admin', 'gerente'))
  );

CREATE POLICY "bancos_update" ON bancos
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND perfil IN ('admin', 'gerente'))
  );

-- ============================================================
-- TABELA: produtos
-- ============================================================
CREATE TABLE produtos (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID        NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
  codigo      TEXT        NOT NULL,
  nome        TEXT        NOT NULL,
  descricao   TEXT,
  ativo       BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT produtos_codigo_empresa_uq UNIQUE (empresa_id, codigo)
);

ALTER TABLE produtos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "produtos_select" ON produtos
  FOR SELECT USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid())
  );

CREATE POLICY "produtos_insert" ON produtos
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND perfil IN ('admin', 'gerente'))
  );

CREATE POLICY "produtos_update" ON produtos
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND perfil IN ('admin', 'gerente'))
  );
