-- Fecha buraco de isolamento entre empresas em corretores/imobiliarias/parceiros.
--
-- `corretores` e `imobiliarias` nunca tiveram `empresa_id` (migration 065) e a
-- RLS delas libera geral pra qualquer usuário autenticado
-- (`FOR ALL TO authenticated USING (true)`). `parceiros` ganhou `empresa_id`
-- depois (migration 115), mas a policy antiga sem filtro nunca foi removida —
-- as duas convivem (RLS faz OR entre policies permissivas), então a
-- restrição por empresa nunca teve efeito de verdade.
--
-- Motivado por: construção da tela de gestão de Corretores/Imobiliárias/
-- Parceiros em Configurações — sem isso, a tela de edição/exclusão ficaria
-- "global" entre empresas, por engano.

-- ── corretores/imobiliarias: adiciona empresa_id ────────────────────────────
ALTER TABLE imobiliarias ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES empresas(id);
ALTER TABLE corretores   ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES empresas(id);

-- Backfill: hoje só existe uma empresa no banco — atribui os registros
-- legados a ela. Se o sistema virar multi-tenant de verdade com histórico
-- anterior a esta migration, essa suposição precisa ser revisitada.
UPDATE imobiliarias SET empresa_id = (SELECT id FROM empresas LIMIT 1) WHERE empresa_id IS NULL;
UPDATE corretores   SET empresa_id = (SELECT id FROM empresas LIMIT 1) WHERE empresa_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_imobiliarias_empresa ON imobiliarias(empresa_id);
CREATE INDEX IF NOT EXISTS idx_corretores_empresa   ON corretores(empresa_id);

-- ── RLS: remove as policies permissivas antigas ─────────────────────────────
DROP POLICY IF EXISTS "autenticados leem imobiliarias"     ON imobiliarias;
DROP POLICY IF EXISTS "autenticados escrevem imobiliarias" ON imobiliarias;
DROP POLICY IF EXISTS "autenticados leem corretores"       ON corretores;
DROP POLICY IF EXISTS "autenticados escrevem corretores"   ON corretores;
DROP POLICY IF EXISTS "autenticados leem parceiros"        ON parceiros;
DROP POLICY IF EXISTS "autenticados escrevem parceiros"    ON parceiros;
-- parceiros_empresa_policy (migration 115) fica — só cobria SELECT/UPDATE/
-- INSERT/DELETE via USING sem WITH CHECK; substituída abaixo por policies
-- explícitas por comando, no mesmo padrão das outras duas tabelas.
DROP POLICY IF EXISTS "parceiros_empresa_policy" ON parceiros;

-- ── RLS: policies escopadas por empresa (mesmo padrão de registros_imoveis) ─
CREATE POLICY "imobiliarias_empresa_select" ON imobiliarias FOR SELECT USING (
  empresa_id IS NULL OR empresa_id IN (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid())
);
CREATE POLICY "imobiliarias_empresa_insert" ON imobiliarias FOR INSERT WITH CHECK (
  empresa_id IN (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid())
);
CREATE POLICY "imobiliarias_empresa_update" ON imobiliarias FOR UPDATE
  USING (empresa_id IS NULL OR empresa_id IN (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid()))
  WITH CHECK (empresa_id IN (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid()));

CREATE POLICY "corretores_empresa_select" ON corretores FOR SELECT USING (
  empresa_id IS NULL OR empresa_id IN (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid())
);
CREATE POLICY "corretores_empresa_insert" ON corretores FOR INSERT WITH CHECK (
  empresa_id IN (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid())
);
CREATE POLICY "corretores_empresa_update" ON corretores FOR UPDATE
  USING (empresa_id IS NULL OR empresa_id IN (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid()))
  WITH CHECK (empresa_id IN (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid()));

CREATE POLICY "parceiros_empresa_select" ON parceiros FOR SELECT USING (
  empresa_id IS NULL OR empresa_id IN (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid())
);
CREATE POLICY "parceiros_empresa_insert" ON parceiros FOR INSERT WITH CHECK (
  empresa_id IN (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid())
);
CREATE POLICY "parceiros_empresa_update" ON parceiros FOR UPDATE
  USING (empresa_id IS NULL OR empresa_id IN (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid()))
  WITH CHECK (empresa_id IN (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid()));

-- Sem policy de DELETE nas 3 — exclusão é sempre lógica (UPDATE ativo=false),
-- mesmo padrão de registros_imoveis.

NOTIFY pgrst, 'reload schema';
