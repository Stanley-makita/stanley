-- Permissões individuais — exceção por usuário, acima do perfil.
--
-- Mesmo padrão de perfil_permissoes (20260720_176): camada de sobreposição,
-- ausência de linha para (usuario_id, ação) significa "herda do perfil" —
-- nunca "sem acesso" e nunca "acesso liberado" por omissão. A tabela nasce
-- vazia de propósito, sem seed — ninguém muda de acesso só por esta migration
-- existir.
--
-- Fundação genérica: não é dedicada a leads.ver_todas/leads.redistribuir —
-- qualquer ação configurável pode ganhar uma exceção individual aqui no
-- futuro (ex.: conversas.ver_todas, processos.ver_todos), sem migration nova.

CREATE TABLE IF NOT EXISTS usuario_permissoes (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID          NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  usuario_id  UUID          NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  acao        TEXT          NOT NULL,
  permitido   BOOLEAN       NOT NULL DEFAULT false,
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  UNIQUE (usuario_id, acao)
);

CREATE INDEX IF NOT EXISTS idx_usuario_permissoes_empresa ON usuario_permissoes(empresa_id);
CREATE INDEX IF NOT EXISTS idx_usuario_permissoes_usuario ON usuario_permissoes(usuario_id);

ALTER TABLE usuario_permissoes ENABLE ROW LEVEL SECURITY;

-- Leitura: qualquer usuário ativo lê as permissões individuais da própria
-- empresa (mesmo critério de perfil_permissoes — necessário no client tanto
-- pra resolver a própria permissão quanto pra tela de admin editar a de
-- outro usuário).
CREATE POLICY "up_select" ON usuario_permissoes
  FOR SELECT USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() AND ativo = true)
  );

-- Escrita: só admin da própria empresa, e nunca gravando empresa_id de outra empresa.
CREATE POLICY "up_insert" ON usuario_permissoes
  FOR INSERT WITH CHECK (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() AND ativo = true)
    AND (SELECT perfil FROM usuarios WHERE auth_user_id = auth.uid() AND ativo = true) = 'admin'
  );

CREATE POLICY "up_update" ON usuario_permissoes
  FOR UPDATE USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() AND ativo = true)
    AND (SELECT perfil FROM usuarios WHERE auth_user_id = auth.uid() AND ativo = true) = 'admin'
  )
  WITH CHECK (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() AND ativo = true)
  );

CREATE POLICY "up_delete" ON usuario_permissoes
  FOR DELETE USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() AND ativo = true)
    AND (SELECT perfil FROM usuarios WHERE auth_user_id = auth.uid() AND ativo = true) = 'admin'
  );

COMMENT ON TABLE usuario_permissoes IS
  'Overrides de permissão por (usuario_id, ação) — exceção individual, acima do override de perfil. Ausência de linha = herda de perfil_permissoes / PERMISSOES_PADRAO.';
