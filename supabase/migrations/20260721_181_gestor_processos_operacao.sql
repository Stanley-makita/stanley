-- Bug legado gerente×gestor — sub-tabelas de Processos e operação.
--
-- Mesma causa dos commits anteriores: só 'gerente' era reconhecido, nunca
-- 'gestor'. Troca cirúrgica nos IN-lists, mantém 'gerente'. WITH CHECK
-- explícito adicionado nas policies de UPDATE que não tinham
-- (proc_tarefas_update, proc_compradores_update, proc_vendedores_update,
-- proc_custas_update).
--
-- Rollback: DROP as policies novas e recriar exatamente como em
-- supabase/migrations/20260415_005_processos.sql,
-- supabase/migrations/20260415_010_documentos.sql,
-- supabase/migrations/20260508_029_solicitacoes_operacionais.sql,
-- supabase/migrations/20260415_012_leads_correcoes.sql e
-- supabase/migrations/20260506_020_conversas_multiinstancia.sql
-- (todas com IN ('admin','gerente')/('analista','gerente','admin'), sem
-- gestor).

-- ── Sub-tabelas de Processos ──────────────────────────────────
DROP POLICY "proc_tarefas_update" ON processo_tarefas;
CREATE POLICY "proc_tarefas_update" ON processo_tarefas
  FOR UPDATE
  USING (
    empresa_id IN (
      SELECT empresa_id FROM usuarios u
      WHERE u.id = auth.uid()
        AND u.ativo = true
        AND (
          u.id = processo_tarefas.responsavel_id
          OR u.id = processo_tarefas.criado_por
          OR u.perfil IN ('gerente', 'gestor', 'admin')
        )
    )
  )
  WITH CHECK (
    empresa_id IN (
      SELECT empresa_id FROM usuarios u
      WHERE u.id = auth.uid()
        AND u.ativo = true
        AND (
          u.id = processo_tarefas.responsavel_id
          OR u.id = processo_tarefas.criado_por
          OR u.perfil IN ('gerente', 'gestor', 'admin')
        )
    )
  );

DROP POLICY "proc_compradores_update" ON processo_compradores;
CREATE POLICY "proc_compradores_update" ON processo_compradores
  FOR UPDATE
  USING (empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true AND perfil IN ('analista','gerente','gestor','admin')))
  WITH CHECK (empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true AND perfil IN ('analista','gerente','gestor','admin')));

DROP POLICY "proc_compradores_delete" ON processo_compradores;
CREATE POLICY "proc_compradores_delete" ON processo_compradores
  FOR DELETE USING (empresa_id IN (SELECT empresa_id FROM usuarios u WHERE u.id = auth.uid() AND u.ativo = true AND u.perfil IN ('gerente','gestor','admin')));

DROP POLICY "proc_vendedores_update" ON processo_vendedores;
CREATE POLICY "proc_vendedores_update" ON processo_vendedores
  FOR UPDATE
  USING (empresa_id IN (SELECT empresa_id FROM usuarios u WHERE u.id = auth.uid() AND u.ativo = true AND u.perfil IN ('analista','gerente','gestor','admin')))
  WITH CHECK (empresa_id IN (SELECT empresa_id FROM usuarios u WHERE u.id = auth.uid() AND u.ativo = true AND u.perfil IN ('analista','gerente','gestor','admin')));

DROP POLICY "proc_vendedores_delete" ON processo_vendedores;
CREATE POLICY "proc_vendedores_delete" ON processo_vendedores
  FOR DELETE USING (empresa_id IN (SELECT empresa_id FROM usuarios u WHERE u.id = auth.uid() AND u.ativo = true AND u.perfil IN ('gerente','gestor','admin')));

DROP POLICY "proc_conta_mov_insert" ON processo_conta_movimentos;
CREATE POLICY "proc_conta_mov_insert" ON processo_conta_movimentos
  FOR INSERT WITH CHECK (usuario_id = auth.uid() AND empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true AND perfil IN ('analista','gerente','gestor','admin')));

DROP POLICY "proc_custas_insert" ON processo_custas;
CREATE POLICY "proc_custas_insert" ON processo_custas
  FOR INSERT WITH CHECK (empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true AND perfil IN ('analista','gerente','gestor','admin')));

DROP POLICY "proc_custas_update" ON processo_custas;
CREATE POLICY "proc_custas_update" ON processo_custas
  FOR UPDATE
  USING (empresa_id IN (SELECT empresa_id FROM usuarios u WHERE u.id = auth.uid() AND u.ativo = true AND u.perfil IN ('analista','gerente','gestor','admin')))
  WITH CHECK (empresa_id IN (SELECT empresa_id FROM usuarios u WHERE u.id = auth.uid() AND u.ativo = true AND u.perfil IN ('analista','gerente','gestor','admin')));

-- ── Documentos de processo ────────────────────────────────────
DROP POLICY "membro_exclui_proprio_ou_gestor" ON processo_documentos;
CREATE POLICY "membro_exclui_proprio_ou_gestor"
  ON processo_documentos FOR DELETE
  USING (
    enviado_por = auth.uid()
    OR EXISTS (
      SELECT 1 FROM usuarios
      WHERE id = auth.uid()
        AND empresa_id = processo_documentos.empresa_id
        AND perfil IN ('admin', 'gerente', 'gestor')
        AND ativo = true
    )
  );

-- ── Solicitações operacionais ─────────────────────────────────
DROP POLICY "sol_op_update" ON solicitacoes_operacionais;
CREATE POLICY "sol_op_update" ON solicitacoes_operacionais FOR UPDATE
  USING (empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid())
    AND (responsavel_id   = (SELECT id FROM usuarios WHERE auth_user_id = auth.uid())
      OR solicitante_id   = (SELECT id FROM usuarios WHERE auth_user_id = auth.uid())
      OR (SELECT perfil FROM usuarios WHERE auth_user_id = auth.uid()) IN ('admin','gerente','gestor')))
  WITH CHECK (empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid())
    AND (responsavel_id   = (SELECT id FROM usuarios WHERE auth_user_id = auth.uid())
      OR solicitante_id   = (SELECT id FROM usuarios WHERE auth_user_id = auth.uid())
      OR (SELECT perfil FROM usuarios WHERE auth_user_id = auth.uid()) IN ('admin','gerente','gestor')));

-- ── Leads (versão vigente da policy de UPDATE) ────────────────
DROP POLICY IF EXISTS "leads_update_responsavel_ou_gerencia" ON leads;
CREATE POLICY "leads_update_responsavel_ou_gerencia" ON leads
  FOR UPDATE
  USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
    AND (
      responsavel_id = (SELECT id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
      OR (SELECT perfil FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1) IN ('admin', 'gerente', 'gestor')
    )
  )
  WITH CHECK (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
  );

-- ── Conversas ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "empresa_conversas_select" ON conversas;
CREATE POLICY "empresa_conversas_select" ON conversas
  FOR SELECT USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
    AND (
      -- Admin, Gerente ou Gestor: sem restrição adicional
      (SELECT perfil FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1) IN ('admin', 'gerente', 'gestor')
      OR
      -- Atendente: conversa atribuída diretamente a ele
      atendente_id = (SELECT id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
      OR
      -- Atendente: conversa na sua instância
      instancia_id IN (
        SELECT id FROM instancias
        WHERE atendente_id = (SELECT id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
      )
      OR
      -- Conversas sem instância/atendente (migradas antes do multi-instância): visíveis a todos
      (atendente_id IS NULL AND instancia_id IS NULL)
    )
  );
