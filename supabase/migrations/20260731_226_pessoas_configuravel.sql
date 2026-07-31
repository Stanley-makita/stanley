-- A tela principal de Pessoas (src/app/(protected)/pessoas/**) lê e escreve
-- direto no Supabase client-side — as rotas /api/pessoas (já com checagem
-- de perfil adicionada antes desta entrega) são um caminho secundário, não
-- o fluxo real da maior parte do produto. A RLS é o enforcement que de fato
-- vale. Troca o perfil fixo por usuario_atual_pode(), preservando as
-- condições atuais (migration 20260721_178) como fallback.

-- ── pessoas ──────────────────────────────────────────────────
DROP POLICY "pessoas_empresa_select" ON pessoas;
CREATE POLICY "pessoas_empresa_select" ON pessoas FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM usuarios u
    WHERE u.auth_user_id = auth.uid() AND u.ativo = true
      AND u.empresa_id = pessoas.empresa_id
      AND usuario_atual_pode('pessoas.ver')
  )
);
DROP POLICY "pessoas_empresa_insert" ON pessoas;
CREATE POLICY "pessoas_empresa_insert" ON pessoas FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM usuarios u
    WHERE u.auth_user_id = auth.uid() AND u.ativo = true
      AND u.empresa_id = pessoas.empresa_id
      AND usuario_atual_pode('pessoas.editar')
  )
);
DROP POLICY "pessoas_empresa_update" ON pessoas;
CREATE POLICY "pessoas_empresa_update" ON pessoas FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.ativo = true
        AND u.empresa_id = pessoas.empresa_id
        AND usuario_atual_pode('pessoas.editar')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.ativo = true
        AND u.empresa_id = pessoas.empresa_id
        AND usuario_atual_pode('pessoas.editar')
    )
  );
DROP POLICY "pessoas_empresa_delete" ON pessoas;
CREATE POLICY "pessoas_empresa_delete" ON pessoas FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM usuarios u
    WHERE u.auth_user_id = auth.uid() AND u.ativo = true
      AND u.empresa_id = pessoas.empresa_id
      AND usuario_atual_pode('pessoas.excluir')
  )
);

-- ── pessoa_telefones (mesmo tratamento, espelha pessoas) ──────
DROP POLICY "pessoa_telefones_empresa_select" ON pessoa_telefones;
CREATE POLICY "pessoa_telefones_empresa_select" ON pessoa_telefones FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM usuarios u
    WHERE u.auth_user_id = auth.uid() AND u.ativo = true
      AND u.empresa_id = pessoa_telefones.empresa_id
      AND usuario_atual_pode('pessoas.ver')
  )
);
DROP POLICY "pessoa_telefones_empresa_insert" ON pessoa_telefones;
CREATE POLICY "pessoa_telefones_empresa_insert" ON pessoa_telefones FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM usuarios u
    WHERE u.auth_user_id = auth.uid() AND u.ativo = true
      AND u.empresa_id = pessoa_telefones.empresa_id
      AND usuario_atual_pode('pessoas.editar')
  )
);
DROP POLICY "pessoa_telefones_empresa_update" ON pessoa_telefones;
CREATE POLICY "pessoa_telefones_empresa_update" ON pessoa_telefones FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.ativo = true
        AND u.empresa_id = pessoa_telefones.empresa_id
        AND usuario_atual_pode('pessoas.editar')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.ativo = true
        AND u.empresa_id = pessoa_telefones.empresa_id
        AND usuario_atual_pode('pessoas.editar')
    )
  );
DROP POLICY "pessoa_telefones_empresa_delete" ON pessoa_telefones;
CREATE POLICY "pessoa_telefones_empresa_delete" ON pessoa_telefones FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM usuarios u
    WHERE u.auth_user_id = auth.uid() AND u.ativo = true
      AND u.empresa_id = pessoa_telefones.empresa_id
      AND usuario_atual_pode('pessoas.excluir')
  )
);
