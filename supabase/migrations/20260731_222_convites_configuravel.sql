-- Troca o perfil fixo da RLS de convites (INSERT e SELECT) por
-- usuario_atual_pode('usuarios.convidar'), mantendo a condição atual
-- (admin/gerente/gestor) como fallback (ver migration 220).

DROP POLICY "convites_insert_gerencia" ON convites;
CREATE POLICY "convites_insert_gerencia" ON convites
  FOR INSERT WITH CHECK (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
    AND usuario_atual_pode('usuarios.convidar')
  );

DROP POLICY "convites_select_gerencia" ON convites;
CREATE POLICY "convites_select_gerencia" ON convites
  FOR SELECT USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
    AND usuario_atual_pode('usuarios.convidar')
  );
