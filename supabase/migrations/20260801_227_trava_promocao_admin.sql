-- Trava de segurança: só um admin pode promover alguém a perfil 'admin'.
-- A policy de UPDATE em usuarios (usuarios_update_rbac) já deixava gestor/
-- gerente editarem outros usuários da empresa, mas sem checar o VALOR de
-- destino de `perfil` — ou seja, um gestor podia rodar
-- `UPDATE usuarios SET perfil = 'admin' WHERE id = ...` direto (bypassando
-- o gate admin-only da rota /api/admin/usuarios/[id]) e se promover ou
-- promover terceiros a admin. Fecha esse buraco no WITH CHECK.
DROP POLICY IF EXISTS "usuarios_update_rbac" ON usuarios;

CREATE POLICY "usuarios_update_rbac" ON usuarios
  FOR UPDATE
  USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
    AND (
      (SELECT perfil FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1) IN ('admin', 'gerente', 'gestor')
      OR auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
    AND (
      (SELECT perfil FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1) IN ('admin', 'gerente', 'gestor')
      OR auth_user_id = auth.uid()
    )
    AND (
      perfil <> 'admin'
      OR (SELECT perfil FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1) = 'admin'
    )
  );

NOTIFY pgrst, 'reload schema';
