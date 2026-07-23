-- Visibilidade por carteira comercial.
--
-- Até aqui, qualquer usuário ativo da empresa enxergava 100% dos registros
-- de Captação (leads), Pessoas, Conversas, Solicitações e Negócios
-- (processos) — as policies de SELECT filtravam só por empresa_id, sem
-- olhar quem é o comercial responsável. Isso não reflete a operação real:
-- cada perfil `comercial` deve ver apenas a própria carteira; os perfis de
-- gestão/operação/recepção (`admin`, `gestor`, `operacional`, `apoio`,
-- `juridico`) continuam com visão total.
--
-- Duas funções auxiliares STABLE centralizam a resolução de "quem está
-- logado", evitando repetir a mesma subquery em cada policy (e servindo de
-- ponto único a manter daqui pra frente).

CREATE OR REPLACE FUNCTION usuario_atual_id() RETURNS uuid AS $$
  SELECT id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION usuario_atual_perfil() RETURNS usuario_perfil AS $$
  SELECT perfil FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION usuario_atual_empresa_id() RETURNS uuid AS $$
  SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- ── Leads: dono = responsavel_id ────────────────────────────────
DROP POLICY IF EXISTS "leads_select_empresa" ON leads;
CREATE POLICY "leads_select_empresa" ON leads
  FOR SELECT USING (
    empresa_id = usuario_atual_empresa_id()
    AND deleted_at IS NULL
    AND (
      usuario_atual_perfil() <> 'comercial'
      OR responsavel_id = usuario_atual_id()
    )
  );

-- Recepção (apoio) também cria captação, além dos perfis já liberados.
DROP POLICY IF EXISTS "leads_insert_equipe" ON leads;
CREATE POLICY "leads_insert_equipe" ON leads
  FOR INSERT WITH CHECK (
    empresa_id = usuario_atual_empresa_id()
    AND usuario_atual_perfil()
        IN ('admin', 'gerente', 'gestor', 'analista', 'consultor', 'comercial', 'apoio')
  );

-- Recepção (apoio) também precisa poder redistribuir (trocar responsavel_id
-- de um lead que não é dela), igual admin/gerente/gestor.
DROP POLICY IF EXISTS "leads_update_responsavel_ou_gerencia" ON leads;
CREATE POLICY "leads_update_responsavel_ou_gerencia" ON leads
  FOR UPDATE
  USING (
    empresa_id = usuario_atual_empresa_id()
    AND (
      responsavel_id = usuario_atual_id()
      OR usuario_atual_perfil() IN ('admin', 'gerente', 'gestor', 'apoio')
    )
  )
  WITH CHECK (
    empresa_id = usuario_atual_empresa_id()
  );

-- ── Processos ("Negócios"): dono = comercial_id OU operacional_id ──
-- Corrige de passagem a comparação usuarios.id = auth.uid() (deveria ser
-- auth_user_id = auth.uid(), igual às demais tabelas — mesmo padrão de bug
-- já corrigido em outras policies deste projeto).
DROP POLICY IF EXISTS "processos_select" ON processos;
CREATE POLICY "processos_select" ON processos
  FOR SELECT
  USING (
    empresa_id = usuario_atual_empresa_id()
    AND deleted_at IS NULL
    AND (
      usuario_atual_perfil() <> 'comercial'
      OR comercial_id = usuario_atual_id()
      OR operacional_id = usuario_atual_id()
    )
  );

-- ── Pessoas: sem coluna própria de comercial — dono via lead atual ──
DROP POLICY IF EXISTS "pessoas_empresa_select" ON pessoas;
CREATE POLICY "pessoas_empresa_select" ON pessoas FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM usuarios u
    WHERE u.auth_user_id = auth.uid() AND u.ativo = true
      AND u.empresa_id = pessoas.empresa_id
      AND u.perfil IN ('admin', 'gestor', 'comercial', 'operacional', 'juridico', 'apoio', 'gerente', 'analista', 'consultor')
  )
  AND (
    usuario_atual_perfil() <> 'comercial'
    OR EXISTS (
      SELECT 1 FROM leads l
      WHERE l.pessoa_id = pessoas.id
        AND l.deleted_at IS NULL
        AND l.responsavel_id = usuario_atual_id()
    )
  )
);

-- ── Conversas: comercial só vê conversas do lead da própria carteira ──
-- Para os demais perfis (admin/gerente/gestor com visão total, e quem
-- atende via atendente_id/instancia_id) a regra existente é mantida.
DROP POLICY IF EXISTS "empresa_conversas_select" ON conversas;
CREATE POLICY "empresa_conversas_select" ON conversas
  FOR SELECT USING (
    empresa_id = usuario_atual_empresa_id()
    AND (
      CASE WHEN usuario_atual_perfil() = 'comercial' THEN
        lead_id IN (
          SELECT id FROM leads
          WHERE responsavel_id = usuario_atual_id() AND deleted_at IS NULL
        )
      ELSE
        usuario_atual_perfil() IN ('admin', 'gerente', 'gestor', 'operacional', 'apoio', 'juridico')
        OR atendente_id = usuario_atual_id()
        OR instancia_id IN (
          SELECT id FROM instancias WHERE atendente_id = usuario_atual_id()
        )
        OR (atendente_id IS NULL AND instancia_id IS NULL)
      END
    )
  );

-- ── Solicitações operacionais ──────────────────────────────────
-- Comercial vê o que ele mesmo abriu, ou o que estiver vinculado a um
-- lead/processo da própria carteira.
DROP POLICY IF EXISTS "sol_op_select" ON solicitacoes_operacionais;
CREATE POLICY "sol_op_select" ON solicitacoes_operacionais FOR SELECT
  USING (
    empresa_id = usuario_atual_empresa_id()
    AND (
      usuario_atual_perfil() <> 'comercial'
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
