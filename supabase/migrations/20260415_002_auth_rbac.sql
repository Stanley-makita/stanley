-- ============================================================
-- Migration: 20260415_002_auth_rbac
-- Módulo: Autenticação + RBAC
-- ============================================================

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ativo         BOOLEAN     NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ultimo_acesso TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_auth_user_id
  ON usuarios(auth_user_id)
  WHERE auth_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS convites (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID        NOT NULL REFERENCES empresas(id)  ON DELETE RESTRICT,
  email       TEXT        NOT NULL,
  perfil      usuario_perfil NOT NULL,
  token       TEXT        NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  criado_por  UUID        NOT NULL REFERENCES usuarios(id)  ON DELETE RESTRICT,
  aceito_em   TIMESTAMPTZ,
  expira_em   TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '48 hours'),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE convites ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_convites_empresa_id ON convites(empresa_id);
CREATE INDEX IF NOT EXISTS idx_convites_token      ON convites(token);
CREATE INDEX IF NOT EXISTS idx_convites_email      ON convites(email);

ALTER TABLE convites ADD CONSTRAINT convites_nao_aceitar_expirado
  CHECK (aceito_em IS NULL OR aceito_em <= expira_em);

CREATE TABLE IF NOT EXISTS sessoes_audit (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id  UUID        REFERENCES usuarios(id) ON DELETE SET NULL,
  empresa_id  UUID        NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
  ip_address  INET,
  user_agent  TEXT,
  evento      TEXT        NOT NULL CHECK (evento IN ('login', 'logout', 'senha_alterada')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE sessoes_audit ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_sessoes_audit_empresa_id  ON sessoes_audit(empresa_id);
CREATE INDEX IF NOT EXISTS idx_sessoes_audit_usuario_id  ON sessoes_audit(usuario_id);
CREATE INDEX IF NOT EXISTS idx_sessoes_audit_created_at  ON sessoes_audit(created_at DESC);

DROP POLICY IF EXISTS "usuarios_select_empresa" ON usuarios;
CREATE POLICY "usuarios_select_empresa" ON usuarios
  FOR SELECT USING (
    empresa_id = (
      SELECT empresa_id FROM usuarios
      WHERE auth_user_id = auth.uid()
      LIMIT 1
    )
  );

DROP POLICY IF EXISTS "usuarios_update_rbac" ON usuarios;
CREATE POLICY "usuarios_update_rbac" ON usuarios
  FOR UPDATE USING (
    empresa_id = (
      SELECT empresa_id FROM usuarios
      WHERE auth_user_id = auth.uid()
      LIMIT 1
    )
    AND (
      (
        SELECT perfil FROM usuarios
        WHERE auth_user_id = auth.uid()
        LIMIT 1
      ) IN ('admin', 'gerente')
      OR auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "convites_select_gerencia"  ON convites;
CREATE POLICY "convites_select_gerencia" ON convites
  FOR SELECT USING (
    empresa_id = (
      SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1
    )
    AND (
      SELECT perfil FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1
    ) IN ('admin', 'gerente')
  );

DROP POLICY IF EXISTS "convites_insert_gerencia" ON convites;
CREATE POLICY "convites_insert_gerencia" ON convites
  FOR INSERT WITH CHECK (
    empresa_id = (
      SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1
    )
    AND (
      SELECT perfil FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1
    ) IN ('admin', 'gerente')
  );

DROP POLICY IF EXISTS "convites_delete_admin" ON convites;
CREATE POLICY "convites_delete_admin" ON convites
  FOR DELETE USING (
    aceito_em IS NULL
    AND empresa_id = (
      SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1
    )
    AND (
      SELECT perfil FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1
    ) = 'admin'
  );

DROP POLICY IF EXISTS "sessoes_audit_select_admin" ON sessoes_audit;
CREATE POLICY "sessoes_audit_select_admin" ON sessoes_audit
  FOR SELECT USING (
    empresa_id = (
      SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1
    )
    AND (
      SELECT perfil FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1
    ) = 'admin'
  );

CREATE OR REPLACE FUNCTION sincronizar_perfil_jwt()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE auth.users
  SET raw_app_meta_data = raw_app_meta_data ||
    jsonb_build_object(
      'perfil',     NEW.perfil::text,
      'ativo',      NEW.ativo,
      'empresa_id', NEW.empresa_id::text
    )
  WHERE id = NEW.auth_user_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_sincronizar_perfil_jwt
  AFTER INSERT OR UPDATE OF perfil, ativo ON usuarios
  FOR EACH ROW
  WHEN (NEW.auth_user_id IS NOT NULL)
  EXECUTE FUNCTION sincronizar_perfil_jwt();

CREATE OR REPLACE FUNCTION validar_token_convite(p_token TEXT)
RETURNS TABLE (
  valido  BOOLEAN,
  email   TEXT,
  perfil  usuario_perfil
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    TRUE               AS valido,
    c.email            AS email,
    c.perfil           AS perfil
  FROM convites c
  WHERE c.token     = p_token
    AND c.aceito_em IS NULL
    AND c.expira_em  > now();
END;
$$;

CREATE INDEX IF NOT EXISTS idx_convites_expira_em
  ON convites(expira_em)
  WHERE aceito_em IS NULL;

CREATE INDEX IF NOT EXISTS idx_usuarios_empresa_ativo
  ON usuarios(empresa_id, ativo)
  WHERE deleted_at IS NULL AND ativo = true;

CREATE INDEX IF NOT EXISTS idx_convites_empresa_aceito
  ON convites(empresa_id, aceito_em DESC)
  WHERE aceito_em IS NOT NULL;
