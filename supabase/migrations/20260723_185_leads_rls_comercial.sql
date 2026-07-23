-- Alinha as policies de RLS de `leads` à matriz de permissões da aplicação
-- (PERMISSOES_PADRAO em src/lib/auth/permissions.ts), que já concede
-- leads.criar/leads.editar ao perfil `comercial`. As policies antigas
-- nunca foram atualizadas quando os perfis `gestor`/`comercial` foram
-- criados (mesmo padrão de bug já corrigido em 20260721_181 para
-- Processos/operação).

-- ── Leads: INSERT ──────────────────────────────────────────────
DROP POLICY IF EXISTS "leads_insert_equipe" ON leads;
CREATE POLICY "leads_insert_equipe" ON leads
  FOR INSERT WITH CHECK (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
    AND (SELECT perfil FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
        IN ('admin', 'gerente', 'gestor', 'analista', 'consultor', 'comercial')
  );

-- ── Leads: UPDATE ──────────────────────────────────────────────
DROP POLICY IF EXISTS "leads_update_responsavel_ou_gerencia" ON leads;
CREATE POLICY "leads_update_responsavel_ou_gerencia" ON leads
  FOR UPDATE
  USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
    AND (
      responsavel_id = (SELECT id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
      OR (SELECT perfil FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
          IN ('admin', 'gerente', 'gestor', 'comercial')
    )
  )
  WITH CHECK (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
  );
