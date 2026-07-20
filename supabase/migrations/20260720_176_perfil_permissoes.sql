-- Perfis de Acesso configurável — tabela de overrides.
--
-- Camada de sobreposição sobre a matriz oficial em código (PERMISSOES_PADRAO,
-- src/lib/auth/permissions.ts): ausência de linha para um (empresa, perfil,
-- ação) significa "usa o padrão do código", nunca "sem acesso". A tabela
-- nasce vazia de propósito — sem seed, sem trigger para empresas novas — o
-- fallback do código já cobre os dois casos.

CREATE TABLE IF NOT EXISTS perfil_permissoes (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID          NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  perfil      usuario_perfil NOT NULL,
  acao        TEXT          NOT NULL,
  permitido   BOOLEAN       NOT NULL DEFAULT false,
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, perfil, acao)
);

CREATE INDEX IF NOT EXISTS idx_perfil_permissoes_empresa ON perfil_permissoes(empresa_id);

ALTER TABLE perfil_permissoes ENABLE ROW LEVEL SECURITY;

-- Leitura: qualquer usuário ativo lê as permissões da própria empresa
-- (necessário no client para resolver as próprias permissões).
CREATE POLICY "pp_select" ON perfil_permissoes
  FOR SELECT USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() AND ativo = true)
  );

-- Escrita: só admin da própria empresa, e nunca gravando empresa_id de outra empresa.
CREATE POLICY "pp_insert" ON perfil_permissoes
  FOR INSERT WITH CHECK (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() AND ativo = true)
    AND (SELECT perfil FROM usuarios WHERE auth_user_id = auth.uid() AND ativo = true) = 'admin'
  );

CREATE POLICY "pp_update" ON perfil_permissoes
  FOR UPDATE USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() AND ativo = true)
    AND (SELECT perfil FROM usuarios WHERE auth_user_id = auth.uid() AND ativo = true) = 'admin'
  )
  WITH CHECK (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() AND ativo = true)
  );

CREATE POLICY "pp_delete" ON perfil_permissoes
  FOR DELETE USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() AND ativo = true)
    AND (SELECT perfil FROM usuarios WHERE auth_user_id = auth.uid() AND ativo = true) = 'admin'
  );

COMMENT ON TABLE perfil_permissoes IS
  'Overrides de permissão por (empresa, perfil, ação). Ausência de linha = usa PERMISSOES_PADRAO do código.';
