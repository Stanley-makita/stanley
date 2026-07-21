-- Bug legado gerente×gestor — Configurações avançadas e cadastros-base.
--
-- Mesma causa dos commits anteriores: só 'gerente' era reconhecido, nunca
-- 'gestor'. Aqui os nomes de duas policies (gestor_escreve_metas,
-- gestor_atualiza_metas, gestor_escreve_comissoes_padrao,
-- gestor_atualiza_comissoes_padrao) já diziam "gestor" — só o corpo SQL
-- nunca foi corrigido.
--
-- Troca cirúrgica: adiciona 'gestor' aos IN-lists. Adiciona WITH CHECK
-- explícito em fases_update/bancos_update/produtos_update/
-- usuarios_update_rbac (não tinham); as de metas/comissões padrão já
-- tinham WITH CHECK, só ajusta o IN-list.
--
-- Rollback: DROP as policies novas e recriar exatamente como em
-- supabase/migrations/20260415_011_configuracoes_avancadas.sql,
-- supabase/migrations/20260415_001_base_config.sql e
-- supabase/migrations/20260415_002_auth_rbac.sql (todas com
-- IN ('admin','gerente'), sem gestor).

-- ── Configurações avançadas ──────────────────────────────────
DROP POLICY "gestor_escreve_metas" ON metas_equipe;
CREATE POLICY "gestor_escreve_metas" ON metas_equipe
  FOR INSERT
  WITH CHECK (
    empresa_id IN (
      SELECT empresa_id FROM usuarios
      WHERE id = auth.uid() AND perfil IN ('admin', 'gerente', 'gestor') AND ativo = true
    )
  );

DROP POLICY "gestor_atualiza_metas" ON metas_equipe;
CREATE POLICY "gestor_atualiza_metas" ON metas_equipe
  FOR UPDATE
  USING (
    empresa_id IN (
      SELECT empresa_id FROM usuarios
      WHERE id = auth.uid() AND perfil IN ('admin', 'gerente', 'gestor') AND ativo = true
    )
  )
  WITH CHECK (
    empresa_id IN (
      SELECT empresa_id FROM usuarios
      WHERE id = auth.uid() AND perfil IN ('admin', 'gerente', 'gestor') AND ativo = true
    )
  );

DROP POLICY "gestor_escreve_comissoes_padrao" ON comissoes_padrao;
CREATE POLICY "gestor_escreve_comissoes_padrao" ON comissoes_padrao
  FOR INSERT
  WITH CHECK (
    empresa_id IN (
      SELECT empresa_id FROM usuarios
      WHERE id = auth.uid() AND perfil IN ('admin', 'gerente', 'gestor') AND ativo = true
    )
  );

DROP POLICY "gestor_atualiza_comissoes_padrao" ON comissoes_padrao;
CREATE POLICY "gestor_atualiza_comissoes_padrao" ON comissoes_padrao
  FOR UPDATE
  USING (
    empresa_id IN (
      SELECT empresa_id FROM usuarios
      WHERE id = auth.uid() AND perfil IN ('admin', 'gerente', 'gestor') AND ativo = true
    )
  )
  WITH CHECK (
    empresa_id IN (
      SELECT empresa_id FROM usuarios
      WHERE id = auth.uid() AND perfil IN ('admin', 'gerente', 'gestor') AND ativo = true
    )
  );

-- ── Cadastros-base: fases, bancos, produtos ──────────────────
DROP POLICY "fases_insert" ON fases;
CREATE POLICY "fases_insert" ON fases
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE id = auth.uid() AND perfil IN ('admin', 'gerente', 'gestor')
    )
  );

DROP POLICY "fases_update" ON fases;
CREATE POLICY "fases_update" ON fases
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE id = auth.uid() AND perfil IN ('admin', 'gerente', 'gestor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE id = auth.uid() AND perfil IN ('admin', 'gerente', 'gestor')
    )
  );

DROP POLICY "bancos_insert" ON bancos;
CREATE POLICY "bancos_insert" ON bancos
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND perfil IN ('admin', 'gerente', 'gestor'))
  );

DROP POLICY "bancos_update" ON bancos;
CREATE POLICY "bancos_update" ON bancos
  FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND perfil IN ('admin', 'gerente', 'gestor'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND perfil IN ('admin', 'gerente', 'gestor'))
  );

DROP POLICY "produtos_insert" ON produtos;
CREATE POLICY "produtos_insert" ON produtos
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND perfil IN ('admin', 'gerente', 'gestor'))
  );

DROP POLICY "produtos_update" ON produtos;
CREATE POLICY "produtos_update" ON produtos
  FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND perfil IN ('admin', 'gerente', 'gestor'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND perfil IN ('admin', 'gerente', 'gestor'))
  );

-- ── Usuários e Convites ───────────────────────────────────────
DROP POLICY "usuarios_select" ON usuarios;
CREATE POLICY "usuarios_select" ON usuarios
  FOR SELECT USING (
    deleted_at IS NULL AND (
      id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM usuarios u
        WHERE u.id = auth.uid()
          AND u.empresa_id = usuarios.empresa_id
          AND u.perfil IN ('admin', 'gerente', 'analista', 'gestor')
      )
    )
  );

DROP POLICY "usuarios_update_rbac" ON usuarios;
CREATE POLICY "usuarios_update_rbac" ON usuarios
  FOR UPDATE
  USING (
    empresa_id = (
      SELECT empresa_id FROM usuarios
      WHERE auth_user_id = auth.uid()
      LIMIT 1
    )
    AND (
      (
        SELECT perfil FROM usuarios
        WHERE auth_user_id = auth.uid()
        LIMIT 1
      ) IN ('admin', 'gerente', 'gestor')
      OR auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    empresa_id = (
      SELECT empresa_id FROM usuarios
      WHERE auth_user_id = auth.uid()
      LIMIT 1
    )
    AND (
      (
        SELECT perfil FROM usuarios
        WHERE auth_user_id = auth.uid()
        LIMIT 1
      ) IN ('admin', 'gerente', 'gestor')
      OR auth_user_id = auth.uid()
    )
  );

DROP POLICY "convites_select_gerencia" ON convites;
CREATE POLICY "convites_select_gerencia" ON convites
  FOR SELECT USING (
    empresa_id = (
      SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1
    )
    AND (
      SELECT perfil FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1
    ) IN ('admin', 'gerente', 'gestor')
  );

DROP POLICY "convites_insert_gerencia" ON convites;
CREATE POLICY "convites_insert_gerencia" ON convites
  FOR INSERT WITH CHECK (
    empresa_id = (
      SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1
    )
    AND (
      SELECT perfil FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1
    ) IN ('admin', 'gerente', 'gestor')
  );
