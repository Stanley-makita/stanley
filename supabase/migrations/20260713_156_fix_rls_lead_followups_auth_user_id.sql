-- Migration 156: corrige RLS de lead_followups — coluna errada pra identificar o usuário
--
-- A policy de SELECT original (migration 139) e as de INSERT/UPDATE que eu
-- adicionei na migration 153 usavam `usuarios.id = auth.uid()`. Isso está
-- errado: `usuarios.id` é só a PK interna da tabela, gerada independente do
-- Supabase Auth — quem de fato referencia o usuário autenticado é a coluna
-- `usuarios.auth_user_id` (FK pra auth.users, ver migration 20260415_002).
-- Confirmado pelo padrão já usado (e funcionando) em praticamente todo o
-- resto do sistema, ex.: a função registrar_interacao_lead (usada pelas
-- Notas) usa `WHERE auth_user_id = auth.uid()`.
--
-- Com a coluna errada, a subquery `SELECT empresa_id FROM usuarios WHERE id
-- = auth.uid()` nunca encontra o usuário de verdade — sempre retorna NULL —
-- e a policy de INSERT rejeita qualquer tentativa (empresa_id = NULL nunca
-- bate com o empresa_id real do lead). É por isso que o "Ainda não" seguiu
-- dando "Erro ao iniciar acompanhamento." mesmo depois da migration 153.

DROP POLICY IF EXISTS "empresa_le_followups" ON lead_followups;
DROP POLICY IF EXISTS "empresa_cria_followups" ON lead_followups;
DROP POLICY IF EXISTS "empresa_atualiza_followups" ON lead_followups;

CREATE POLICY "empresa_le_followups"
  ON lead_followups FOR SELECT
  USING (empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid()));

CREATE POLICY "empresa_cria_followups"
  ON lead_followups FOR INSERT
  WITH CHECK (empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid()));

CREATE POLICY "empresa_atualiza_followups"
  ON lead_followups FOR UPDATE
  USING (empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid()))
  WITH CHECK (empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid()));

-- Mesmo bug na policy de SELECT de lead_followup_eventos (migration 139) —
-- corrigida por consistência, mesmo sem uso client-side hoje confirmado.
DROP POLICY IF EXISTS "empresa_le_followup_eventos" ON lead_followup_eventos;

CREATE POLICY "empresa_le_followup_eventos"
  ON lead_followup_eventos FOR SELECT
  USING (empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid()));
