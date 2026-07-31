-- Troca o perfil fixo da RLS de Financeiro (comissoes + financeiro_lancamentos)
-- por usuario_atual_pode('financeiro.editar'), preservando as duas nuances
-- que não fazem parte dessa ação:
--   - fin_lanc_insert: 'analista' pode LANÇAR (insert) mesmo sem
--     financeiro.editar — regra própria, mantida como OR separado, não
--     absorvida pela permissão configurável (analista continua sem poder
--     editar/excluir lançamento depois).
--   - fin_lanc_delete: dono do lançamento (usuario_id) sempre pode excluir
--     o próprio, independente de perfil — ownership, não é a permissão
--     configurável.

DROP POLICY "comissoes_insert" ON comissoes;
CREATE POLICY "comissoes_insert" ON comissoes
  FOR INSERT
  WITH CHECK (
    empresa_id IN (
      SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true
    )
    AND usuario_atual_pode('financeiro.editar')
  );

DROP POLICY "comissoes_update" ON comissoes;
CREATE POLICY "comissoes_update" ON comissoes
  FOR UPDATE
  USING (
    empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true)
    AND usuario_atual_pode('financeiro.editar')
  )
  WITH CHECK (
    empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true)
    AND usuario_atual_pode('financeiro.editar')
  );

DROP POLICY "fin_lanc_insert" ON financeiro_lancamentos;
CREATE POLICY "fin_lanc_insert" ON financeiro_lancamentos
  FOR INSERT
  WITH CHECK (
    usuario_id = auth.uid()
    AND empresa_id IN (
      SELECT empresa_id FROM usuarios u
      WHERE u.id = auth.uid() AND u.ativo = true
        AND (u.perfil = 'analista' OR usuario_atual_pode('financeiro.editar'))
    )
  );

DROP POLICY "fin_lanc_update" ON financeiro_lancamentos;
CREATE POLICY "fin_lanc_update" ON financeiro_lancamentos
  FOR UPDATE
  USING (
    empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true)
    AND usuario_atual_pode('financeiro.editar')
  )
  WITH CHECK (
    empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true)
    AND usuario_atual_pode('financeiro.editar')
  );

DROP POLICY "fin_lanc_delete" ON financeiro_lancamentos;
CREATE POLICY "fin_lanc_delete" ON financeiro_lancamentos
  FOR DELETE
  USING (
    empresa_id IN (
      SELECT empresa_id FROM usuarios u
      WHERE u.id = auth.uid() AND u.ativo = true
        AND (u.id = financeiro_lancamentos.usuario_id OR usuario_atual_pode('financeiro.editar'))
    )
  );
