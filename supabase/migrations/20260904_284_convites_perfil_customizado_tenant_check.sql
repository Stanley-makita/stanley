-- Perfis de Acesso Customizados — fix de revisão final (finding 5/6).
--
-- A policy de INSERT em convites (migration 222) checava empresa_id e
-- usuario_atual_pode('usuarios.convidar'), mas não validava que
-- perfil_customizado_id (coluna nova, migration 282) pertence à mesma
-- empresa do usuário que está criando o convite. Sem isso, um convite
-- poderia ser criado apontando pra um perfil customizado de outra empresa
-- (isolamento de tenant quebrado) — mesma classe de bug corrigida nas rotas
-- POST/PUT de /api/admin/usuarios.
--
-- PENDENTE: não pôde ser executada contra um banco real nesta sessão (sem
-- Supabase CLI/credenciais no worktree) — precisa rodar manualmente, igual
-- às migrations 280-283.

DROP POLICY "convites_insert_gerencia" ON convites;
CREATE POLICY "convites_insert_gerencia" ON convites
  FOR INSERT WITH CHECK (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
    AND usuario_atual_pode('usuarios.convidar')
    AND (
      perfil_customizado_id IS NULL
      OR perfil_customizado_id IN (
        SELECT id FROM perfis_acesso
         WHERE empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
      )
    )
  );
