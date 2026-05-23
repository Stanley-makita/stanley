-- Corrige políticas RLS de documentos_clientes para suportar
-- usuários criados pelo padrão antigo (usuarios.id = auth.uid())
-- e pelo padrão novo (usuarios.auth_user_id = auth.uid())

DROP POLICY IF EXISTS "doc_cli_select" ON documentos_clientes;
DROP POLICY IF EXISTS "doc_cli_insert" ON documentos_clientes;
DROP POLICY IF EXISTS "doc_cli_update" ON documentos_clientes;

CREATE POLICY "doc_cli_select" ON documentos_clientes FOR SELECT
  USING (
    empresa_id = (
      SELECT empresa_id FROM usuarios
      WHERE (auth_user_id = auth.uid() OR id = auth.uid())
        AND ativo = true
      LIMIT 1
    )
  );

CREATE POLICY "doc_cli_insert" ON documentos_clientes FOR INSERT
  WITH CHECK (
    empresa_id = (
      SELECT empresa_id FROM usuarios
      WHERE (auth_user_id = auth.uid() OR id = auth.uid())
        AND ativo = true
      LIMIT 1
    )
  );

CREATE POLICY "doc_cli_update" ON documentos_clientes FOR UPDATE
  USING (
    empresa_id = (
      SELECT empresa_id FROM usuarios
      WHERE (auth_user_id = auth.uid() OR id = auth.uid())
        AND ativo = true
      LIMIT 1
    )
  );
