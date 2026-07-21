-- Bug legado gerente×gestor — Biblioteca e Financeiro.
--
-- O perfil ativo "gestor" (substituto moderno de "gerente") nunca foi
-- incluído nestas policies — só "gerente" (perfil legado, 0 usuários reais
-- hoje). Um usuário gestor real não conseguia publicar/gerenciar Biblioteca
-- nem lançar/editar Financeiro, mesmo tendo essas ações na matriz oficial
-- (biblioteca.publicar/excluir, financeiro.editar concedidos a gestor via
-- TODAS_ACOES em PERMISSOES_PADRAO).
--
-- Troca cirúrgica: adiciona 'gestor' aos IN-lists existentes, mantém
-- 'gerente' (compatibilidade). Também adiciona WITH CHECK explícito nas
-- policies FOR ALL/FOR UPDATE que não tinham (bk_categorias_write,
-- bk_docs_write, comissoes_update, fin_lanc_update).
--
-- Rollback: DROP as policies novas e recriar exatamente como em
-- supabase/migrations/20260507_026_biblioteca.sql e
-- supabase/migrations/20260415_006_financeiro.sql (IN ('admin','gerente'),
-- sem gestor, sem WITH CHECK nas citadas acima).

-- ── Biblioteca ───────────────────────────────────────────────
DROP POLICY "bk_categorias_write" ON base_conhecimento_categorias;
CREATE POLICY "bk_categorias_write" ON base_conhecimento_categorias
  FOR ALL
  USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
    AND (SELECT perfil FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1) IN ('admin', 'gerente', 'gestor')
  )
  WITH CHECK (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
    AND (SELECT perfil FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1) IN ('admin', 'gerente', 'gestor')
  );

DROP POLICY "bk_docs_select_publicado" ON base_conhecimento_docs;
CREATE POLICY "bk_docs_select_publicado" ON base_conhecimento_docs
  FOR SELECT USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
    AND deleted_at IS NULL
    AND (
      publicado = true
      OR (SELECT perfil FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1) IN ('admin', 'gerente', 'gestor')
    )
  );

DROP POLICY "bk_docs_write" ON base_conhecimento_docs;
CREATE POLICY "bk_docs_write" ON base_conhecimento_docs
  FOR ALL
  USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
    AND (SELECT perfil FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1) IN ('admin', 'gerente', 'gestor')
  )
  WITH CHECK (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
    AND (SELECT perfil FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1) IN ('admin', 'gerente', 'gestor')
  );

-- ── Financeiro ───────────────────────────────────────────────
DROP POLICY "comissoes_insert" ON comissoes;
CREATE POLICY "comissoes_insert" ON comissoes
  FOR INSERT
  WITH CHECK (
    empresa_id IN (
      SELECT empresa_id FROM usuarios
      WHERE id = auth.uid() AND ativo = true AND perfil IN ('gerente', 'gestor', 'admin')
    )
  );

DROP POLICY "comissoes_update" ON comissoes;
CREATE POLICY "comissoes_update" ON comissoes
  FOR UPDATE
  USING (
    empresa_id IN (
      SELECT empresa_id FROM usuarios
      WHERE id = auth.uid() AND ativo = true AND perfil IN ('gerente', 'gestor', 'admin')
    )
  )
  WITH CHECK (
    empresa_id IN (
      SELECT empresa_id FROM usuarios
      WHERE id = auth.uid() AND ativo = true AND perfil IN ('gerente', 'gestor', 'admin')
    )
  );

DROP POLICY "fin_lanc_insert" ON financeiro_lancamentos;
CREATE POLICY "fin_lanc_insert" ON financeiro_lancamentos
  FOR INSERT
  WITH CHECK (
    usuario_id = auth.uid()
    AND empresa_id IN (
      SELECT empresa_id FROM usuarios
      WHERE id = auth.uid() AND ativo = true AND perfil IN ('analista', 'gerente', 'gestor', 'admin')
    )
  );

DROP POLICY "fin_lanc_update" ON financeiro_lancamentos;
CREATE POLICY "fin_lanc_update" ON financeiro_lancamentos
  FOR UPDATE
  USING (
    empresa_id IN (
      SELECT empresa_id FROM usuarios
      WHERE id = auth.uid() AND ativo = true AND perfil IN ('gerente', 'gestor', 'admin')
    )
  )
  WITH CHECK (
    empresa_id IN (
      SELECT empresa_id FROM usuarios
      WHERE id = auth.uid() AND ativo = true AND perfil IN ('gerente', 'gestor', 'admin')
    )
  );

DROP POLICY "fin_lanc_delete" ON financeiro_lancamentos;
CREATE POLICY "fin_lanc_delete" ON financeiro_lancamentos
  FOR DELETE
  USING (
    empresa_id IN (
      SELECT empresa_id FROM usuarios u
      WHERE u.id = auth.uid() AND u.ativo = true
        AND (u.id = financeiro_lancamentos.usuario_id OR u.perfil IN ('gerente', 'gestor', 'admin'))
    )
  );
