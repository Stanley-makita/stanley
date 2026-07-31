-- Troca o perfil fixo da RLS de processos.criar/processos.editar por
-- usuario_atual_pode(), mantendo exatamente as mesmas condições de hoje
-- como fallback (ver migration 220). O ownership via operacional_id em
-- processos_update continua como OR separado — não é parte da permissão
-- configurável, é dono do processo, sempre pode editar independente de
-- perfil (comportamento pré-existente, documentado em 20260721_183,
-- não alterado aqui).

DROP POLICY "processos_insert" ON processos;
CREATE POLICY "processos_insert" ON processos
  FOR INSERT
  WITH CHECK (
    empresa_id IN (
      SELECT empresa_id FROM usuarios
      WHERE id = auth.uid() AND ativo = true
    )
    AND usuario_atual_pode('processos.criar')
  );

DROP POLICY "processos_update" ON processos;
CREATE POLICY "processos_update" ON processos
  FOR UPDATE
  USING (
    empresa_id IN (
      SELECT empresa_id FROM usuarios u
      WHERE u.id = auth.uid() AND u.ativo = true
        AND (u.id = processos.operacional_id OR usuario_atual_pode('processos.editar'))
    )
    AND deleted_at IS NULL
  )
  WITH CHECK (
    empresa_id IN (
      SELECT empresa_id FROM usuarios u
      WHERE u.id = auth.uid() AND u.ativo = true
        AND (u.id = processos.operacional_id OR usuario_atual_pode('processos.editar'))
    )
  );
