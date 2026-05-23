-- =============================================================================
-- MIGRATION 006 — Módulo Financeiro
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE tipo_status_comissao AS ENUM ('a_receber', 'recebido', 'cancelado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE tipo_lancamento AS ENUM ('receita', 'despesa');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS comissoes (
  id                      UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id              UUID          NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  processo_id             UUID          NOT NULL REFERENCES processos(id) ON DELETE CASCADE,
  comercial_id            UUID          REFERENCES usuarios(id),
  valor_bruto             NUMERIC(15,2) NOT NULL DEFAULT 0,
  percentual_comercial    NUMERIC(5,2)  NOT NULL DEFAULT 0,
  valor_comercial         NUMERIC(15,2) NOT NULL DEFAULT 0,
  valor_empresa           NUMERIC(15,2) NOT NULL DEFAULT 0,
  status                  tipo_status_comissao NOT NULL DEFAULT 'a_receber',
  data_emissao            DATE          NOT NULL,
  data_recebimento        DATE,
  competencia_mes         INTEGER       NOT NULL,
  competencia_ano         INTEGER       NOT NULL,
  observacao              TEXT,
  created_at              TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT uq_comissao_processo UNIQUE (processo_id)
);

ALTER TABLE comissoes ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_comissoes_empresa ON comissoes(empresa_id);
CREATE INDEX idx_comissoes_comercial ON comissoes(comercial_id);
CREATE INDEX idx_comissoes_competencia ON comissoes(empresa_id, competencia_ano, competencia_mes);
CREATE INDEX idx_comissoes_status ON comissoes(empresa_id, status);

CREATE TRIGGER trg_comissoes_updated_at
  BEFORE UPDATE ON comissoes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE POLICY "comissoes_select" ON comissoes
  FOR SELECT
  USING (
    empresa_id IN (
      SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true
    )
  );

CREATE POLICY "comissoes_insert" ON comissoes
  FOR INSERT
  WITH CHECK (
    empresa_id IN (
      SELECT empresa_id FROM usuarios
      WHERE id = auth.uid() AND ativo = true AND perfil IN ('gerente', 'admin')
    )
  );

CREATE POLICY "comissoes_update" ON comissoes
  FOR UPDATE
  USING (
    empresa_id IN (
      SELECT empresa_id FROM usuarios
      WHERE id = auth.uid() AND ativo = true AND perfil IN ('gerente', 'admin')
    )
  );

CREATE TABLE IF NOT EXISTS financeiro_lancamentos (
  id                  UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          UUID              NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  tipo                tipo_lancamento   NOT NULL,
  categoria           TEXT              NOT NULL,
  descricao           TEXT              NOT NULL,
  valor               NUMERIC(15,2)     NOT NULL CHECK (valor > 0),
  data_lancamento     DATE              NOT NULL,
  competencia_mes     INTEGER           NOT NULL,
  competencia_ano     INTEGER           NOT NULL,
  usuario_id          UUID              NOT NULL REFERENCES usuarios(id),
  created_at          TIMESTAMPTZ       NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ       NOT NULL DEFAULT now()
);

ALTER TABLE financeiro_lancamentos ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_fin_lanc_empresa ON financeiro_lancamentos(empresa_id);
CREATE INDEX idx_fin_lanc_competencia ON financeiro_lancamentos(empresa_id, competencia_ano, competencia_mes);

CREATE TRIGGER trg_fin_lancamentos_updated_at
  BEFORE UPDATE ON financeiro_lancamentos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE POLICY "fin_lanc_select" ON financeiro_lancamentos
  FOR SELECT
  USING (
    empresa_id IN (
      SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true
    )
  );

CREATE POLICY "fin_lanc_insert" ON financeiro_lancamentos
  FOR INSERT
  WITH CHECK (
    usuario_id = auth.uid()
    AND empresa_id IN (
      SELECT empresa_id FROM usuarios
      WHERE id = auth.uid() AND ativo = true AND perfil IN ('analista', 'gerente', 'admin')
    )
  );

CREATE POLICY "fin_lanc_update" ON financeiro_lancamentos
  FOR UPDATE
  USING (
    empresa_id IN (
      SELECT empresa_id FROM usuarios
      WHERE id = auth.uid() AND ativo = true AND perfil IN ('gerente', 'admin')
    )
  );

CREATE POLICY "fin_lanc_delete" ON financeiro_lancamentos
  FOR DELETE
  USING (
    empresa_id IN (
      SELECT empresa_id FROM usuarios u
      WHERE u.id = auth.uid() AND u.ativo = true
        AND (u.id = financeiro_lancamentos.usuario_id OR u.perfil IN ('gerente', 'admin'))
    )
  );

CREATE OR REPLACE FUNCTION gerar_comissao_ao_emitir()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_valor_bruto        NUMERIC(15,2);
  v_pct_comercial      NUMERIC(5,2);
  v_valor_comercial    NUMERIC(15,2);
  v_valor_empresa      NUMERIC(15,2);
  v_data_emissao       DATE;
BEGIN
  IF NEW.status_emissao <> 'emitido' OR
     (TG_OP = 'UPDATE' AND OLD.status_emissao = 'emitido') THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM usuarios
    WHERE id = auth.uid() AND empresa_id = NEW.empresa_id AND ativo = true
  ) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  IF EXISTS (SELECT 1 FROM comissoes WHERE processo_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  v_valor_bruto     := COALESCE(NEW.valor_financiado, 0) *
                       COALESCE((NEW.comissao_empresa + NEW.comissao_comercial), 0) / 100;
  v_pct_comercial   := COALESCE(NEW.comissao_comercial, 0);
  v_valor_comercial := ROUND(v_valor_bruto * v_pct_comercial / 100, 2);
  v_valor_empresa   := v_valor_bruto - v_valor_comercial;
  v_data_emissao    := COALESCE(NEW.data_emissao, CURRENT_DATE);

  INSERT INTO comissoes (
    empresa_id, processo_id, comercial_id,
    valor_bruto, percentual_comercial, valor_comercial, valor_empresa,
    status, data_emissao,
    competencia_mes, competencia_ano
  ) VALUES (
    NEW.empresa_id, NEW.id, NEW.comercial_id,
    v_valor_bruto, v_pct_comercial, v_valor_comercial, v_valor_empresa,
    'a_receber', v_data_emissao,
    EXTRACT(MONTH FROM v_data_emissao)::INTEGER,
    EXTRACT(YEAR  FROM v_data_emissao)::INTEGER
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_gerar_comissao_ao_emitir
  AFTER INSERT OR UPDATE OF status_emissao ON processos
  FOR EACH ROW
  EXECUTE FUNCTION gerar_comissao_ao_emitir();

CREATE OR REPLACE FUNCTION calcular_kpis_financeiro(
  p_empresa_id UUID,
  p_mes        INTEGER,
  p_ano        INTEGER
)
RETURNS TABLE (
  receita_mes       NUMERIC,
  a_receber         NUMERIC,
  despesas_mes      NUMERIC,
  resultado_liquido NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_receita_comissoes NUMERIC;
  v_receita_lancamentos NUMERIC;
  v_a_receber NUMERIC;
  v_despesas NUMERIC;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM usuarios
    WHERE id = auth.uid() AND empresa_id = p_empresa_id AND ativo = true
  ) THEN
    RAISE EXCEPTION 'Acesso negado: empresa_id inválido para este usuário';
  END IF;

  SELECT COALESCE(SUM(valor_bruto), 0)
  INTO v_receita_comissoes
  FROM comissoes
  WHERE empresa_id = p_empresa_id
    AND status = 'recebido'
    AND EXTRACT(MONTH FROM data_recebimento) = p_mes
    AND EXTRACT(YEAR  FROM data_recebimento) = p_ano;

  SELECT COALESCE(SUM(valor), 0)
  INTO v_receita_lancamentos
  FROM financeiro_lancamentos
  WHERE empresa_id = p_empresa_id
    AND tipo = 'receita'
    AND competencia_mes = p_mes
    AND competencia_ano = p_ano;

  SELECT COALESCE(SUM(valor_bruto), 0)
  INTO v_a_receber
  FROM comissoes
  WHERE empresa_id = p_empresa_id
    AND status = 'a_receber'
    AND competencia_mes = p_mes
    AND competencia_ano = p_ano;

  SELECT COALESCE(SUM(valor), 0)
  INTO v_despesas
  FROM financeiro_lancamentos
  WHERE empresa_id = p_empresa_id
    AND tipo = 'despesa'
    AND competencia_mes = p_mes
    AND competencia_ano = p_ano;

  RETURN QUERY SELECT
    (v_receita_comissoes + v_receita_lancamentos)                            AS receita_mes,
    v_a_receber                                                              AS a_receber,
    v_despesas                                                               AS despesas_mes,
    (v_receita_comissoes + v_receita_lancamentos - v_despesas)               AS resultado_liquido;
END;
$$;

CREATE OR REPLACE FUNCTION relatorio_equipe(
  p_empresa_id UUID,
  p_mes        INTEGER,
  p_ano        INTEGER
)
RETURNS TABLE (
  comercial_id       UUID,
  comercial_nome     TEXT,
  num_contratos      BIGINT,
  valor_emitido      NUMERIC,
  comissao_gerada    NUMERIC,
  comissao_recebida  NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM usuarios
    WHERE id = auth.uid() AND empresa_id = p_empresa_id AND ativo = true
  ) THEN
    RAISE EXCEPTION 'Acesso negado: empresa_id inválido para este usuário';
  END IF;

  RETURN QUERY
  SELECT
    c.comercial_id,
    u.nome                                                                     AS comercial_nome,
    COUNT(c.id)                                                                AS num_contratos,
    COALESCE(SUM(p.valor_financiado), 0)                                      AS valor_emitido,
    COALESCE(SUM(c.valor_bruto), 0)                                           AS comissao_gerada,
    COALESCE(SUM(c.valor_bruto) FILTER (WHERE c.status = 'recebido'), 0)      AS comissao_recebida
  FROM comissoes c
  JOIN usuarios u ON u.id = c.comercial_id
  JOIN processos p ON p.id = c.processo_id
  WHERE c.empresa_id = p_empresa_id
    AND c.competencia_mes = p_mes
    AND c.competencia_ano = p_ano
  GROUP BY c.comercial_id, u.nome
  ORDER BY comissao_gerada DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION calcular_kpis_financeiro(UUID, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION relatorio_equipe(UUID, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION gerar_comissao_ao_emitir() TO authenticated;
