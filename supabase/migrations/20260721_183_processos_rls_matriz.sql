-- Alinhamento de RLS de Processos (Negócios) à matriz oficial.
--
-- Antes: processos_insert só aceitava analista/consultor/gerente/admin —
-- comercial e gestor, que têm processos.criar na matriz, eram rejeitados
-- pelo banco ao tentar criar um novo processo. processos_update (branch
-- "qualquer processo da empresa") só aceitava gerente/admin, sem gestor.
--
-- Depois: processos_insert inclui comercial e gestor (mantém os legados
-- analista/consultor/gerente). processos_update inclui gestor na condição
-- gerencial; a condição do dono via operacional_id continua igual —
-- operacional/juridico continuam podendo editar os próprios processos
-- por serem o responsável designado, não por perfil.
--
-- WITH CHECK explícito adicionado a processos_update (não existia —
-- Postgres reaproveitava USING como check implícito na ausência de um
-- explícito; comportamento efetivo não muda, só fica explícito e
-- documentado). Confirmado por investigação: isso não amplia nem
-- restringe a capacidade real de campo do dono via operacional_id — ele
-- já podia alterar qualquer coluna do processo (banco, modalidade,
-- valores, taxa, prazo, fases, checklist), sem controle de campo na
-- aplicação; esse escopo mais amplo fica documentado como dívida técnica
-- separada (não é alterado nem restringido aqui).
--
-- Rollback: DROP as policies novas e recriar exatamente como em
-- supabase/migrations/20260415_005_processos.sql (processos_insert com
-- IN ('analista','consultor','gerente','admin'), processos_update sem
-- gestor e sem WITH CHECK explícito).

DROP POLICY "processos_insert" ON processos;
CREATE POLICY "processos_insert" ON processos
  FOR INSERT
  WITH CHECK (
    empresa_id IN (
      SELECT empresa_id FROM usuarios
      WHERE id = auth.uid() AND ativo = true
        AND perfil IN ('analista', 'consultor', 'gerente', 'gestor', 'comercial', 'admin')
    )
  );

DROP POLICY "processos_update" ON processos;
CREATE POLICY "processos_update" ON processos
  FOR UPDATE
  USING (
    empresa_id IN (
      SELECT empresa_id FROM usuarios u
      WHERE u.id = auth.uid() AND u.ativo = true
        AND (u.id = processos.operacional_id OR u.perfil IN ('gerente', 'gestor', 'admin'))
    )
    AND deleted_at IS NULL
  )
  WITH CHECK (
    empresa_id IN (
      SELECT empresa_id FROM usuarios u
      WHERE u.id = auth.uid() AND u.ativo = true
        AND (u.id = processos.operacional_id OR u.perfil IN ('gerente', 'gestor', 'admin'))
    )
  );
