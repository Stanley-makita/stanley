-- Migration 211: RLS helper function para verificar travamento
-- As tabelas já têm RLS individual que checa status != 'travado'.
-- Esta migration adiciona a função auxiliar reutilizável e ajusta
-- as policies das tabelas que precisam verificar o fechamento pai.

-- Helper: retorna true se o fechamento está travado
CREATE OR REPLACE FUNCTION fin_fechamento_travado(p_fechamento_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM financeiro_fechamentos
    WHERE id = p_fechamento_id AND status = 'travado'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Helper: empresa do usuário autenticado
CREATE OR REPLACE FUNCTION fin_empresa_usuario()
RETURNS UUID AS $$
  SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Adicionar policy de SELECT consolidada para contas_receber (caso não exista)
-- As policies criadas anteriormente com FOR ALL cobrem isso, mas explicitamos
-- o bloqueio de escrita para fechamentos travados nas tabelas filho:

-- financeiro_contas_receber: já tem RLS com FOR ALL. Substituir update/delete
-- para bloquear quando fechamento está travado.
DROP POLICY IF EXISTS fin_cr_all ON financeiro_contas_receber;

CREATE POLICY fin_cr_select ON financeiro_contas_receber
  FOR SELECT USING (empresa_id = fin_empresa_usuario());

CREATE POLICY fin_cr_insert ON financeiro_contas_receber
  FOR INSERT WITH CHECK (
    empresa_id = fin_empresa_usuario()
    AND (fechamento_id IS NULL OR NOT fin_fechamento_travado(fechamento_id))
  );

CREATE POLICY fin_cr_update ON financeiro_contas_receber
  FOR UPDATE USING (
    empresa_id = fin_empresa_usuario()
    AND (fechamento_id IS NULL OR NOT fin_fechamento_travado(fechamento_id))
  );

CREATE POLICY fin_cr_delete ON financeiro_contas_receber
  FOR DELETE USING (
    empresa_id = fin_empresa_usuario()
    AND (fechamento_id IS NULL OR NOT fin_fechamento_travado(fechamento_id))
  );

-- financeiro_notas_fiscais: bloquear inserção/atualização quando
-- a conta_receber está em fechamento travado
DROP POLICY IF EXISTS fin_nf_all ON financeiro_notas_fiscais;

CREATE POLICY fin_nf_select ON financeiro_notas_fiscais
  FOR SELECT USING (empresa_id = fin_empresa_usuario());

CREATE POLICY fin_nf_write ON financeiro_notas_fiscais
  FOR INSERT WITH CHECK (
    empresa_id = fin_empresa_usuario()
    AND NOT EXISTS (
      SELECT 1 FROM financeiro_contas_receber cr
      WHERE cr.id = conta_receber_id AND fin_fechamento_travado(cr.fechamento_id)
    )
  );

-- financeiro_recebimentos: mesma lógica
DROP POLICY IF EXISTS fin_rec_all ON financeiro_recebimentos;

CREATE POLICY fin_rec_select ON financeiro_recebimentos
  FOR SELECT USING (empresa_id = fin_empresa_usuario());

CREATE POLICY fin_rec_write ON financeiro_recebimentos
  FOR INSERT WITH CHECK (
    empresa_id = fin_empresa_usuario()
    AND NOT EXISTS (
      SELECT 1 FROM financeiro_contas_receber cr
      WHERE cr.id = conta_receber_id AND fin_fechamento_travado(cr.fechamento_id)
    )
  );

-- financeiro_folhas
DROP POLICY IF EXISTS fin_folhas_all ON financeiro_folhas;

CREATE POLICY fin_folhas_select ON financeiro_folhas
  FOR SELECT USING (empresa_id = fin_empresa_usuario());

CREATE POLICY fin_folhas_insert ON financeiro_folhas
  FOR INSERT WITH CHECK (
    empresa_id = fin_empresa_usuario()
    AND (fechamento_id IS NULL OR NOT fin_fechamento_travado(fechamento_id))
  );

CREATE POLICY fin_folhas_update ON financeiro_folhas
  FOR UPDATE USING (
    empresa_id = fin_empresa_usuario()
    AND (fechamento_id IS NULL OR NOT fin_fechamento_travado(fechamento_id))
  );

-- financeiro_folha_itens: via folha
DROP POLICY IF EXISTS fin_fi_all ON financeiro_folha_itens;

CREATE POLICY fin_fi_select ON financeiro_folha_itens
  FOR SELECT USING (empresa_id = fin_empresa_usuario());

CREATE POLICY fin_fi_write ON financeiro_folha_itens
  FOR ALL USING (
    empresa_id = fin_empresa_usuario()
    AND NOT EXISTS (
      SELECT 1 FROM financeiro_folhas fl
      JOIN financeiro_fechamentos ff ON ff.id = fl.fechamento_id
      WHERE fl.id = folha_id AND ff.status = 'travado'
    )
  );

-- financeiro_despesas_recorrentes e financeiro_contas_bancarias:
-- não estão vinculadas a fechamentos, mantêm RLS simples por empresa
DROP POLICY IF EXISTS fin_dr_all ON financeiro_despesas_recorrentes;
CREATE POLICY fin_dr_all ON financeiro_despesas_recorrentes
  FOR ALL USING (empresa_id = fin_empresa_usuario());

DROP POLICY IF EXISTS fin_cb_all ON financeiro_contas_bancarias;
CREATE POLICY fin_cb_all ON financeiro_contas_bancarias
  FOR ALL USING (empresa_id = fin_empresa_usuario());

DROP POLICY IF EXISTS fin_sb_all ON financeiro_saldos_bancarios;
CREATE POLICY fin_sb_all ON financeiro_saldos_bancarios
  FOR ALL USING (empresa_id = fin_empresa_usuario());

DROP POLICY IF EXISTS fin_conf_all ON financeiro_conferencias;
CREATE POLICY fin_conf_all ON financeiro_conferencias
  FOR ALL USING (empresa_id = fin_empresa_usuario());

-- financeiro_ajustes: imutável (só INSERT)
DROP POLICY IF EXISTS fin_aj_select ON financeiro_ajustes;
DROP POLICY IF EXISTS fin_aj_insert ON financeiro_ajustes;

CREATE POLICY fin_aj_select ON financeiro_ajustes
  FOR SELECT USING (empresa_id = fin_empresa_usuario());

CREATE POLICY fin_aj_insert ON financeiro_ajustes
  FOR INSERT WITH CHECK (empresa_id = fin_empresa_usuario());
