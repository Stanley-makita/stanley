-- Alinhamento de RLS de Pessoas à matriz oficial corrigida (ver commit
-- anterior: comercial/operacional ganharam pessoas.editar, confirmado como
-- o fluxo real diário da empresa).
--
-- Antes: pessoas_empresa e pessoa_telefones_empresa eram FOR ALL só por
-- empresa_id, sem checar perfil — qualquer usuário ativo da empresa
-- conseguia ler/escrever/excluir qualquer Pessoa, incluindo apoio/cliente,
-- que não têm pessoas.ver na matriz.
--
-- Depois: SELECT restrito a quem tem pessoas.ver (todos os perfis ativos
-- exceto apoio; exclui também o perfil legado cliente); INSERT/UPDATE
-- restrito a quem tem pessoas.editar; DELETE restrito a quem tem
-- pessoas.merge/pessoas.excluir. O fluxo de merge
-- (src/app/api/pessoas/[id]/merge/route.ts) usa supabaseAdmin/service-role
-- e já tem seu próprio check de perfil em código — não depende desta RLS,
-- mas o DELETE aqui cobre qualquer exclusão direta via client de sessão.
--
-- pessoas_alt_select (histórico de alterações, migration 061) recebe o
-- mesmo tratamento do bug gerente/gestor nesta migration, por ser RLS de
-- Pessoas — não faz parte dos commits gerais de gerente/gestor.
--
-- Rollback: DROP as policies novas e recriar exatamente como em
-- supabase/migrations/20260507_024_pessoas.sql (pessoas_empresa,
-- pessoa_telefones_empresa — ambas FOR ALL só empresa_id) e
-- 20260529_061_pessoas_campos_expandidos.sql (pessoas_alt_select com
-- IN ('admin','gerente'), sem gestor).

-- ── pessoas ──────────────────────────────────────────────────
DROP POLICY "pessoas_empresa" ON pessoas;

CREATE POLICY "pessoas_empresa_select" ON pessoas FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM usuarios u
    WHERE u.auth_user_id = auth.uid() AND u.ativo = true
      AND u.empresa_id = pessoas.empresa_id
      AND u.perfil IN ('admin', 'gestor', 'comercial', 'operacional', 'juridico', 'gerente', 'analista', 'consultor')
  )
);
CREATE POLICY "pessoas_empresa_insert" ON pessoas FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM usuarios u
    WHERE u.auth_user_id = auth.uid() AND u.ativo = true
      AND u.empresa_id = pessoas.empresa_id
      AND u.perfil IN ('admin', 'gestor', 'comercial', 'operacional', 'gerente', 'analista')
  )
);
CREATE POLICY "pessoas_empresa_update" ON pessoas FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.ativo = true
        AND u.empresa_id = pessoas.empresa_id
        AND u.perfil IN ('admin', 'gestor', 'comercial', 'operacional', 'gerente', 'analista')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.ativo = true
        AND u.empresa_id = pessoas.empresa_id
        AND u.perfil IN ('admin', 'gestor', 'comercial', 'operacional', 'gerente', 'analista')
    )
  );
CREATE POLICY "pessoas_empresa_delete" ON pessoas FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM usuarios u
    WHERE u.auth_user_id = auth.uid() AND u.ativo = true
      AND u.empresa_id = pessoas.empresa_id
      AND u.perfil IN ('admin', 'gestor', 'gerente')
  )
);

-- pessoas_service (FOR ALL TO service_role USING (true)) permanece inalterada.

-- ── pessoa_telefones ─────────────────────────────────────────
DROP POLICY "pessoa_telefones_empresa" ON pessoa_telefones;

CREATE POLICY "pessoa_telefones_empresa_select" ON pessoa_telefones FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM usuarios u
    WHERE u.auth_user_id = auth.uid() AND u.ativo = true
      AND u.empresa_id = pessoa_telefones.empresa_id
      AND u.perfil IN ('admin', 'gestor', 'comercial', 'operacional', 'juridico', 'gerente', 'analista', 'consultor')
  )
);
CREATE POLICY "pessoa_telefones_empresa_insert" ON pessoa_telefones FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM usuarios u
    WHERE u.auth_user_id = auth.uid() AND u.ativo = true
      AND u.empresa_id = pessoa_telefones.empresa_id
      AND u.perfil IN ('admin', 'gestor', 'comercial', 'operacional', 'gerente', 'analista')
  )
);
CREATE POLICY "pessoa_telefones_empresa_update" ON pessoa_telefones FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.ativo = true
        AND u.empresa_id = pessoa_telefones.empresa_id
        AND u.perfil IN ('admin', 'gestor', 'comercial', 'operacional', 'gerente', 'analista')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.ativo = true
        AND u.empresa_id = pessoa_telefones.empresa_id
        AND u.perfil IN ('admin', 'gestor', 'comercial', 'operacional', 'gerente', 'analista')
    )
  );
CREATE POLICY "pessoa_telefones_empresa_delete" ON pessoa_telefones FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM usuarios u
    WHERE u.auth_user_id = auth.uid() AND u.ativo = true
      AND u.empresa_id = pessoa_telefones.empresa_id
      AND u.perfil IN ('admin', 'gestor', 'gerente')
  )
);

-- pessoa_telefones_service (FOR ALL TO service_role USING (true)) permanece inalterada.

-- ── pessoas_alteracoes (histórico) — inclui gestor no bug gerente/gestor ──
DROP POLICY "pessoas_alt_select" ON pessoas_alteracoes;

CREATE POLICY "pessoas_alt_select" ON pessoas_alteracoes
  FOR SELECT USING (
    empresa_id IN (
      SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true
    )
    AND (
      (SELECT perfil FROM usuarios WHERE id = auth.uid()) IN ('admin', 'gerente', 'gestor')
      OR usuario_id = (SELECT id FROM usuarios WHERE id = auth.uid())
    )
  );
