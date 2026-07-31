-- A escrita real de Biblioteca é 100% client-side direto no Supabase
-- (src/app/(protected)/base-conhecimento/**), não pelas rotas /api/base-
-- conhecimento — a RLS é o enforcement que de fato vale. Troca o perfil
-- fixo por usuario_atual_pode(), preservando a condição atual
-- (admin/gerente/gestor) como fallback.
--
-- "Excluir" um documento hoje é soft-delete via UPDATE (deleted_at), não um
-- DELETE de verdade — por isso INSERT/UPDATE de base_conhecimento_docs não
-- dá pra separar só com RLS (RLS não filtra coluna). Trigger BEFORE UPDATE
-- exige biblioteca.excluir especificamente quando deleted_at passa de NULL
-- pra preenchido, além da permissão base de biblioteca.publicar que já
-- protege qualquer UPDATE — mesmo padrão de leads_protege_redistribuicao
-- (20260730_218). DELETE de verdade (hoje sem nenhum caminho no código)
-- também fica gated por biblioteca.excluir, por segurança.

-- ── Categorias ───────────────────────────────────────────────
DROP POLICY "bk_categorias_write" ON base_conhecimento_categorias;
CREATE POLICY "bk_categorias_write" ON base_conhecimento_categorias
  FOR ALL
  USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
    AND usuario_atual_pode('biblioteca.publicar')
  )
  WITH CHECK (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
    AND usuario_atual_pode('biblioteca.publicar')
  );

-- ── Documentos: visibilidade de rascunhos (não-publicados) ────
DROP POLICY "bk_docs_select_publicado" ON base_conhecimento_docs;
CREATE POLICY "bk_docs_select_publicado" ON base_conhecimento_docs
  FOR SELECT USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
    AND deleted_at IS NULL
    AND (
      publicado = true
      OR usuario_atual_pode('biblioteca.publicar')
    )
  );

-- ── Documentos: criar/editar (inclui o soft-delete via UPDATE) ─
DROP POLICY "bk_docs_write" ON base_conhecimento_docs;
CREATE POLICY "bk_docs_insert" ON base_conhecimento_docs
  FOR INSERT WITH CHECK (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
    AND usuario_atual_pode('biblioteca.publicar')
  );
CREATE POLICY "bk_docs_update" ON base_conhecimento_docs
  FOR UPDATE
  USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
    AND usuario_atual_pode('biblioteca.publicar')
  )
  WITH CHECK (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
    AND usuario_atual_pode('biblioteca.publicar')
  );
CREATE POLICY "bk_docs_delete" ON base_conhecimento_docs
  FOR DELETE USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
    AND usuario_atual_pode('biblioteca.excluir')
  );

CREATE OR REPLACE FUNCTION bk_docs_protege_exclusao() RETURNS trigger AS $$
BEGIN
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL
     AND NOT usuario_atual_pode('biblioteca.excluir') THEN
    RAISE EXCEPTION 'Sem permissão para excluir documentos (biblioteca.excluir)'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trigger_bk_docs_protege_exclusao ON base_conhecimento_docs;
CREATE TRIGGER trigger_bk_docs_protege_exclusao
  BEFORE UPDATE ON base_conhecimento_docs
  FOR EACH ROW
  EXECUTE FUNCTION bk_docs_protege_exclusao();
