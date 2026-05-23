-- ============================================================
-- Migration: 20260415_012_leads_correcoes
-- Corrige itens apontados pela revisão de código (Renata Revisão)
-- C1: UPDATE policy sem WITH CHECK
-- A1: REVOKE INSERT on lead_historico
-- A2: tipo TEXT CHECK → enum PostgreSQL
-- ============================================================

-- ------------------------------------------------------------
-- C1: Recriar policy de UPDATE em leads com WITH CHECK
-- Sem WITH CHECK, o usuário poderia alterar empresa_id para
-- valor de outra empresa, quebrando o isolamento multi-tenant.
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "leads_update_responsavel_ou_gerencia" ON leads;

CREATE POLICY "leads_update_responsavel_ou_gerencia" ON leads
  FOR UPDATE
  USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
    AND (
      responsavel_id = (SELECT id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
      OR (SELECT perfil FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1) IN ('admin', 'gerente')
    )
  )
  WITH CHECK (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
  );

-- ------------------------------------------------------------
-- A1: Bloquear INSERT direto em lead_historico
-- INSERT só deve ocorrer via triggers SECURITY DEFINER.
-- ------------------------------------------------------------

REVOKE INSERT ON lead_historico FROM authenticated;

-- ------------------------------------------------------------
-- A2: Converter coluna tipo de TEXT CHECK para enum PostgreSQL
-- Padrão do projeto: campos de status/tipo sempre como enum.
-- ------------------------------------------------------------

CREATE TYPE lead_historico_tipo AS ENUM (
  'criacao',
  'fase_mudanca',
  'edicao',
  'comentario'
);

ALTER TABLE lead_historico
  DROP CONSTRAINT IF EXISTS lead_historico_tipo_check;

ALTER TABLE lead_historico
  ALTER COLUMN tipo TYPE lead_historico_tipo
  USING tipo::lead_historico_tipo;
