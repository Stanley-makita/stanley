-- Alinhamento de RLS do RH à matriz oficial de Perfis de Acesso.
--
-- Antes: todas as 9 tabelas de RH tinham uma única policy FOR ALL restrita
-- só por empresa_id, sem checar perfil — qualquer usuário ativo da empresa
-- (comercial, operacional, apoio, etc.) conseguia ler/escrever dados de RH,
-- incluindo rh_funcionarios.salario_base, chamando a API/Supabase direto.
--
-- Depois: leitura (SELECT) restrita a admin+gestor (rh.ver na matriz);
-- escrita (INSERT/UPDATE/DELETE) restrita a admin (rh.editar na matriz).
--
-- Rollback: DROP as policies novas listadas abaixo e recriar a policy
-- antiga de cada tabela exatamente como estava em
-- supabase/migrations/20260617_106_rh_base.sql (FOR ALL, só empresa_id,
-- sem checar perfil) — texto completo documentado nesse arquivo.

-- ── Departamentos ────────────────────────────────────────────
DROP POLICY rh_dep_empresa ON rh_departamentos;

CREATE POLICY rh_dep_empresa_select ON rh_departamentos FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM usuarios u
    WHERE u.auth_user_id = auth.uid() AND u.ativo = true
      AND u.empresa_id = rh_departamentos.empresa_id
      AND u.perfil IN ('admin', 'gestor')
  )
);
CREATE POLICY rh_dep_empresa_insert ON rh_departamentos FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM usuarios u
    WHERE u.auth_user_id = auth.uid() AND u.ativo = true
      AND u.empresa_id = rh_departamentos.empresa_id
      AND u.perfil = 'admin'
  )
);
CREATE POLICY rh_dep_empresa_update ON rh_departamentos FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.ativo = true
        AND u.empresa_id = rh_departamentos.empresa_id
        AND u.perfil = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.ativo = true
        AND u.empresa_id = rh_departamentos.empresa_id
        AND u.perfil = 'admin'
    )
  );
CREATE POLICY rh_dep_empresa_delete ON rh_departamentos FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM usuarios u
    WHERE u.auth_user_id = auth.uid() AND u.ativo = true
      AND u.empresa_id = rh_departamentos.empresa_id
      AND u.perfil = 'admin'
  )
);

-- ── Regras de Comissão ───────────────────────────────────────
DROP POLICY rh_regra_empresa ON rh_regras_comissao;

CREATE POLICY rh_regra_empresa_select ON rh_regras_comissao FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM usuarios u
    WHERE u.auth_user_id = auth.uid() AND u.ativo = true
      AND u.empresa_id = rh_regras_comissao.empresa_id
      AND u.perfil IN ('admin', 'gestor')
  )
);
CREATE POLICY rh_regra_empresa_insert ON rh_regras_comissao FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM usuarios u
    WHERE u.auth_user_id = auth.uid() AND u.ativo = true
      AND u.empresa_id = rh_regras_comissao.empresa_id
      AND u.perfil = 'admin'
  )
);
CREATE POLICY rh_regra_empresa_update ON rh_regras_comissao FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.ativo = true
        AND u.empresa_id = rh_regras_comissao.empresa_id
        AND u.perfil = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.ativo = true
        AND u.empresa_id = rh_regras_comissao.empresa_id
        AND u.perfil = 'admin'
    )
  );
CREATE POLICY rh_regra_empresa_delete ON rh_regras_comissao FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM usuarios u
    WHERE u.auth_user_id = auth.uid() AND u.ativo = true
      AND u.empresa_id = rh_regras_comissao.empresa_id
      AND u.perfil = 'admin'
  )
);

-- ── Faixas de Comissão (relação indireta via regra_id) ────────
DROP POLICY rh_faixa_empresa ON rh_faixas_comissao;

CREATE POLICY rh_faixa_empresa_select ON rh_faixas_comissao FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM rh_regras_comissao r
    JOIN usuarios u ON u.auth_user_id = auth.uid() AND u.ativo = true AND u.empresa_id = r.empresa_id
    WHERE r.id = rh_faixas_comissao.regra_id AND u.perfil IN ('admin', 'gestor')
  )
);
CREATE POLICY rh_faixa_empresa_insert ON rh_faixas_comissao FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM rh_regras_comissao r
    JOIN usuarios u ON u.auth_user_id = auth.uid() AND u.ativo = true AND u.empresa_id = r.empresa_id
    WHERE r.id = rh_faixas_comissao.regra_id AND u.perfil = 'admin'
  )
);
CREATE POLICY rh_faixa_empresa_update ON rh_faixas_comissao FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM rh_regras_comissao r
      JOIN usuarios u ON u.auth_user_id = auth.uid() AND u.ativo = true AND u.empresa_id = r.empresa_id
      WHERE r.id = rh_faixas_comissao.regra_id AND u.perfil = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM rh_regras_comissao r
      JOIN usuarios u ON u.auth_user_id = auth.uid() AND u.ativo = true AND u.empresa_id = r.empresa_id
      WHERE r.id = rh_faixas_comissao.regra_id AND u.perfil = 'admin'
    )
  );
CREATE POLICY rh_faixa_empresa_delete ON rh_faixas_comissao FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM rh_regras_comissao r
    JOIN usuarios u ON u.auth_user_id = auth.uid() AND u.ativo = true AND u.empresa_id = r.empresa_id
    WHERE r.id = rh_faixas_comissao.regra_id AND u.perfil = 'admin'
  )
);

-- ── Cargos ───────────────────────────────────────────────────
DROP POLICY rh_cargo_empresa ON rh_cargos;

CREATE POLICY rh_cargo_empresa_select ON rh_cargos FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM usuarios u
    WHERE u.auth_user_id = auth.uid() AND u.ativo = true
      AND u.empresa_id = rh_cargos.empresa_id
      AND u.perfil IN ('admin', 'gestor')
  )
);
CREATE POLICY rh_cargo_empresa_insert ON rh_cargos FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM usuarios u
    WHERE u.auth_user_id = auth.uid() AND u.ativo = true
      AND u.empresa_id = rh_cargos.empresa_id
      AND u.perfil = 'admin'
  )
);
CREATE POLICY rh_cargo_empresa_update ON rh_cargos FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.ativo = true
        AND u.empresa_id = rh_cargos.empresa_id
        AND u.perfil = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.ativo = true
        AND u.empresa_id = rh_cargos.empresa_id
        AND u.perfil = 'admin'
    )
  );
CREATE POLICY rh_cargo_empresa_delete ON rh_cargos FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM usuarios u
    WHERE u.auth_user_id = auth.uid() AND u.ativo = true
      AND u.empresa_id = rh_cargos.empresa_id
      AND u.perfil = 'admin'
  )
);

-- ── Funcionários (contém salario_base — maior risco) ──────────
DROP POLICY rh_func_empresa ON rh_funcionarios;

CREATE POLICY rh_func_empresa_select ON rh_funcionarios FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM usuarios u
    WHERE u.auth_user_id = auth.uid() AND u.ativo = true
      AND u.empresa_id = rh_funcionarios.empresa_id
      AND u.perfil IN ('admin', 'gestor')
  )
);
CREATE POLICY rh_func_empresa_insert ON rh_funcionarios FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM usuarios u
    WHERE u.auth_user_id = auth.uid() AND u.ativo = true
      AND u.empresa_id = rh_funcionarios.empresa_id
      AND u.perfil = 'admin'
  )
);
CREATE POLICY rh_func_empresa_update ON rh_funcionarios FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.ativo = true
        AND u.empresa_id = rh_funcionarios.empresa_id
        AND u.perfil = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.ativo = true
        AND u.empresa_id = rh_funcionarios.empresa_id
        AND u.perfil = 'admin'
    )
  );
CREATE POLICY rh_func_empresa_delete ON rh_funcionarios FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM usuarios u
    WHERE u.auth_user_id = auth.uid() AND u.ativo = true
      AND u.empresa_id = rh_funcionarios.empresa_id
      AND u.perfil = 'admin'
  )
);

-- ── Empresas vinculadas ao funcionário (relação indireta) ─────
DROP POLICY rh_func_emp_empresa ON rh_funcionario_empresas;

CREATE POLICY rh_func_emp_empresa_select ON rh_funcionario_empresas FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM rh_funcionarios f
    JOIN usuarios u ON u.auth_user_id = auth.uid() AND u.ativo = true AND u.empresa_id = f.empresa_id
    WHERE f.id = rh_funcionario_empresas.funcionario_id AND u.perfil IN ('admin', 'gestor')
  )
);
CREATE POLICY rh_func_emp_empresa_insert ON rh_funcionario_empresas FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM rh_funcionarios f
    JOIN usuarios u ON u.auth_user_id = auth.uid() AND u.ativo = true AND u.empresa_id = f.empresa_id
    WHERE f.id = rh_funcionario_empresas.funcionario_id AND u.perfil = 'admin'
  )
);
CREATE POLICY rh_func_emp_empresa_update ON rh_funcionario_empresas FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM rh_funcionarios f
      JOIN usuarios u ON u.auth_user_id = auth.uid() AND u.ativo = true AND u.empresa_id = f.empresa_id
      WHERE f.id = rh_funcionario_empresas.funcionario_id AND u.perfil = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM rh_funcionarios f
      JOIN usuarios u ON u.auth_user_id = auth.uid() AND u.ativo = true AND u.empresa_id = f.empresa_id
      WHERE f.id = rh_funcionario_empresas.funcionario_id AND u.perfil = 'admin'
    )
  );
CREATE POLICY rh_func_emp_empresa_delete ON rh_funcionario_empresas FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM rh_funcionarios f
    JOIN usuarios u ON u.auth_user_id = auth.uid() AND u.ativo = true AND u.empresa_id = f.empresa_id
    WHERE f.id = rh_funcionario_empresas.funcionario_id AND u.perfil = 'admin'
  )
);

-- ── Ponto ────────────────────────────────────────────────────
DROP POLICY rh_ponto_empresa ON rh_ponto;

CREATE POLICY rh_ponto_empresa_select ON rh_ponto FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM usuarios u
    WHERE u.auth_user_id = auth.uid() AND u.ativo = true
      AND u.empresa_id = rh_ponto.empresa_id
      AND u.perfil IN ('admin', 'gestor')
  )
);
CREATE POLICY rh_ponto_empresa_insert ON rh_ponto FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM usuarios u
    WHERE u.auth_user_id = auth.uid() AND u.ativo = true
      AND u.empresa_id = rh_ponto.empresa_id
      AND u.perfil = 'admin'
  )
);
CREATE POLICY rh_ponto_empresa_update ON rh_ponto FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.ativo = true
        AND u.empresa_id = rh_ponto.empresa_id
        AND u.perfil = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.ativo = true
        AND u.empresa_id = rh_ponto.empresa_id
        AND u.perfil = 'admin'
    )
  );
CREATE POLICY rh_ponto_empresa_delete ON rh_ponto FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM usuarios u
    WHERE u.auth_user_id = auth.uid() AND u.ativo = true
      AND u.empresa_id = rh_ponto.empresa_id
      AND u.perfil = 'admin'
  )
);

-- ── Férias ───────────────────────────────────────────────────
DROP POLICY rh_ferias_empresa ON rh_ferias;

CREATE POLICY rh_ferias_empresa_select ON rh_ferias FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM usuarios u
    WHERE u.auth_user_id = auth.uid() AND u.ativo = true
      AND u.empresa_id = rh_ferias.empresa_id
      AND u.perfil IN ('admin', 'gestor')
  )
);
CREATE POLICY rh_ferias_empresa_insert ON rh_ferias FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM usuarios u
    WHERE u.auth_user_id = auth.uid() AND u.ativo = true
      AND u.empresa_id = rh_ferias.empresa_id
      AND u.perfil = 'admin'
  )
);
CREATE POLICY rh_ferias_empresa_update ON rh_ferias FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.ativo = true
        AND u.empresa_id = rh_ferias.empresa_id
        AND u.perfil = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.ativo = true
        AND u.empresa_id = rh_ferias.empresa_id
        AND u.perfil = 'admin'
    )
  );
CREATE POLICY rh_ferias_empresa_delete ON rh_ferias FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM usuarios u
    WHERE u.auth_user_id = auth.uid() AND u.ativo = true
      AND u.empresa_id = rh_ferias.empresa_id
      AND u.perfil = 'admin'
  )
);

-- ── Ausências ────────────────────────────────────────────────
DROP POLICY rh_aus_empresa ON rh_ausencias;

CREATE POLICY rh_aus_empresa_select ON rh_ausencias FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM usuarios u
    WHERE u.auth_user_id = auth.uid() AND u.ativo = true
      AND u.empresa_id = rh_ausencias.empresa_id
      AND u.perfil IN ('admin', 'gestor')
  )
);
CREATE POLICY rh_aus_empresa_insert ON rh_ausencias FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM usuarios u
    WHERE u.auth_user_id = auth.uid() AND u.ativo = true
      AND u.empresa_id = rh_ausencias.empresa_id
      AND u.perfil = 'admin'
  )
);
CREATE POLICY rh_aus_empresa_update ON rh_ausencias FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.ativo = true
        AND u.empresa_id = rh_ausencias.empresa_id
        AND u.perfil = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.ativo = true
        AND u.empresa_id = rh_ausencias.empresa_id
        AND u.perfil = 'admin'
    )
  );
CREATE POLICY rh_aus_empresa_delete ON rh_ausencias FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM usuarios u
    WHERE u.auth_user_id = auth.uid() AND u.ativo = true
      AND u.empresa_id = rh_ausencias.empresa_id
      AND u.perfil = 'admin'
  )
);
