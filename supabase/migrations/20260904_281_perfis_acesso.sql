-- Perfis de Acesso Customizados — Task 2/4.
--
-- perfis_acesso: perfis criados pelo admin pela tela (nome + empresa).
-- perfil_customizado_permissoes: matriz de permissões de cada perfil
-- customizado, espelhando o formato de perfil_permissoes (que serve só os 7
-- perfis fixos) mas chaveada pelo id do perfil em vez do enum — evita
-- colisão entre dois perfis customizados diferentes, já que ambos usam o
-- mesmo valor de enum ('customizado').
--
-- Ausência de linha em perfil_customizado_permissoes para uma ação = false,
-- sempre — não existe "padrão do sistema" para um perfil customizado
-- restaurar (diferente de perfil_permissoes, que tem PERMISSOES_PADRAO como
-- fallback no código).

CREATE TABLE perfis_acesso (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID        NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome        TEXT        NOT NULL,
  ativo       BOOLEAN     NOT NULL DEFAULT true,
  created_by  UUID        REFERENCES usuarios(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, nome)
);

CREATE INDEX idx_perfis_acesso_empresa ON perfis_acesso(empresa_id);

ALTER TABLE perfis_acesso ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pa_select" ON perfis_acesso
  FOR SELECT USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() AND ativo = true)
  );

CREATE POLICY "pa_insert" ON perfis_acesso
  FOR INSERT WITH CHECK (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() AND ativo = true)
    AND (SELECT perfil FROM usuarios WHERE auth_user_id = auth.uid() AND ativo = true) = 'admin'
  );

CREATE POLICY "pa_update" ON perfis_acesso
  FOR UPDATE USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() AND ativo = true)
    AND (SELECT perfil FROM usuarios WHERE auth_user_id = auth.uid() AND ativo = true) = 'admin'
  )
  WITH CHECK (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() AND ativo = true)
  );

COMMENT ON TABLE perfis_acesso IS
  'Perfis de acesso criados pelo admin pela tela (além dos 7 fixos). Nome vive aqui; o enum usuarios.perfil usa sempre "customizado".';

CREATE TABLE perfil_customizado_permissoes (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  perfil_customizado_id UUID        NOT NULL REFERENCES perfis_acesso(id) ON DELETE CASCADE,
  acao                  TEXT        NOT NULL,
  permitido             BOOLEAN     NOT NULL DEFAULT false,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (perfil_customizado_id, acao)
);

CREATE INDEX idx_perfil_customizado_permissoes_perfil ON perfil_customizado_permissoes(perfil_customizado_id);

ALTER TABLE perfil_customizado_permissoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pcp_select" ON perfil_customizado_permissoes
  FOR SELECT USING (
    perfil_customizado_id IN (
      SELECT id FROM perfis_acesso
       WHERE empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() AND ativo = true)
    )
  );

CREATE POLICY "pcp_insert" ON perfil_customizado_permissoes
  FOR INSERT WITH CHECK (
    (SELECT perfil FROM usuarios WHERE auth_user_id = auth.uid() AND ativo = true) = 'admin'
    AND perfil_customizado_id IN (
      SELECT id FROM perfis_acesso
       WHERE empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() AND ativo = true)
    )
  );

CREATE POLICY "pcp_update" ON perfil_customizado_permissoes
  FOR UPDATE USING (
    (SELECT perfil FROM usuarios WHERE auth_user_id = auth.uid() AND ativo = true) = 'admin'
    AND perfil_customizado_id IN (
      SELECT id FROM perfis_acesso
       WHERE empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() AND ativo = true)
    )
  )
  WITH CHECK (
    perfil_customizado_id IN (
      SELECT id FROM perfis_acesso
       WHERE empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() AND ativo = true)
    )
  );

CREATE POLICY "pcp_delete" ON perfil_customizado_permissoes
  FOR DELETE USING (
    (SELECT perfil FROM usuarios WHERE auth_user_id = auth.uid() AND ativo = true) = 'admin'
    AND perfil_customizado_id IN (
      SELECT id FROM perfis_acesso
       WHERE empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() AND ativo = true)
    )
  );

COMMENT ON TABLE perfil_customizado_permissoes IS
  'Matriz de permissões de cada perfil customizado. Ausência de linha para uma ação = false (nunca existe fallback "padrão do sistema" aqui).';
