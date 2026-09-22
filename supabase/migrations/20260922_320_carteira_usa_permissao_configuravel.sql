-- Achado real (2026-09-22): usuária com perfil customizado ("Assistente")
-- conseguia abrir um lead fora da própria carteira (via override de
-- leads.ver_todas, RLS de `leads` já usa usuario_atual_pode() desde a
-- migration 20260730_217), mas a aba Pessoa desse lead aparecia vazia e a
-- confirmação de campos extraídos por OCR "aplicava" no banco (a rota usa
-- service role, sempre grava) sem nunca aparecer pra ela — porque a RLS de
-- SELECT de `pessoas` continuava travada no perfil bruto
-- (`usuario_atual_perfil() <> 'comercial'`), ignorando totalmente os 3
-- níveis de override que usuario_atual_pode() já resolve (exceção
-- individual em usuario_permissoes, perfil customizado em
-- perfil_customizado_permissoes, matriz por empresa em perfil_permissoes).
--
-- `leads` foi corrigida em 20260730_217 pra usar usuario_atual_pode(), mas
-- `processos` e `solicitacoes_operacionais` (criadas na mesma migration
-- original, 20260724_186_visibilidade_carteira_comercial.sql) ficaram pra
-- trás com o mesmo hardcode — mesmo bug latente, mesma causa raiz.
-- `conversas` NÃO entra aqui: a policy daquela tabela foi reescrita depois
-- (20260801_230) com um modelo de visibilidade totalmente diferente
-- (atendente_id/instancia_id/participante, sem conceito de carteira), não
-- usa mais `usuario_atual_perfil() <> 'comercial'`.

-- ── Pessoas ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "pessoas_empresa_select" ON pessoas;
CREATE POLICY "pessoas_empresa_select" ON pessoas FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM usuarios u
    WHERE u.auth_user_id = auth.uid() AND u.ativo = true
      AND u.empresa_id = pessoas.empresa_id
      AND usuario_atual_pode('pessoas.ver')
  )
  AND (
    usuario_atual_pode('leads.ver_todas')
    OR EXISTS (
      SELECT 1 FROM leads l
      WHERE l.pessoa_id = pessoas.id
        AND l.deleted_at IS NULL
        AND l.responsavel_id = usuario_atual_id()
    )
  )
);

-- ── Processos ("Negócios") ───────────────────────────────────────
DROP POLICY IF EXISTS "processos_select" ON processos;
CREATE POLICY "processos_select" ON processos
  FOR SELECT
  USING (
    empresa_id = usuario_atual_empresa_id()
    AND deleted_at IS NULL
    AND (
      usuario_atual_pode('leads.ver_todas')
      OR comercial_id = usuario_atual_id()
      OR operacional_id = usuario_atual_id()
    )
  );

-- ── Solicitações operacionais ─────────────────────────────────────
DROP POLICY IF EXISTS "sol_op_select" ON solicitacoes_operacionais;
CREATE POLICY "sol_op_select" ON solicitacoes_operacionais FOR SELECT
  USING (
    empresa_id = usuario_atual_empresa_id()
    AND (
      usuario_atual_pode('leads.ver_todas')
      OR solicitante_id = usuario_atual_id()
      OR responsavel_id = usuario_atual_id()
      OR lead_id IN (
        SELECT id FROM leads
        WHERE responsavel_id = usuario_atual_id() AND deleted_at IS NULL
      )
      OR processo_id IN (
        SELECT id FROM processos
        WHERE (comercial_id = usuario_atual_id() OR operacional_id = usuario_atual_id())
          AND deleted_at IS NULL
      )
    )
  );

NOTIFY pgrst, 'reload schema';
