-- Migration 239: Fix — colunas ambíguas nas funções da migration 237
--
-- Erro real (42702, "column reference is ambiguous"): funções com
-- RETURNS TABLE(...) tornam os nomes das colunas de saída utilizáveis como
-- variáveis em qualquer lugar do corpo da função. Quando uma dessas colunas
-- de saída tem o MESMO NOME de uma coluna real de tabela usada numa query
-- sem qualificação (tabela.coluna), o Postgres não consegue decidir qual é
-- qual e rejeita a query inteira — foi isso que quebrou a listagem de
-- Negócios > Financiamento (comissao_comercial_calculada chama
-- calcular_producao_comercial_mes, que tinha "regra_id" ambíguo contra
-- rh_faixas_comissao.regra_id).
--
-- Fix: qualificar todas as referências com alias de tabela.

CREATE OR REPLACE FUNCTION calcular_producao_comercial_mes(
  p_empresa_id UUID,
  p_comercial_usuario_id UUID,
  p_mes INTEGER,
  p_ano INTEGER
)
RETURNS TABLE (
  producao_total NUMERIC,
  pct_aplicado   NUMERIC,
  comissao_total NUMERIC,
  regra_id       UUID,
  funcionario_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_producao_financiamento NUMERIC;
  v_producao_contrato      NUMERIC;
  v_producao_assessoria    NUMERIC;
  v_producao_total         NUMERIC;
  v_func                   RECORD;
  v_func_found             BOOLEAN;
  v_regra_id               UUID;
  v_regra                  RECORD;
  v_faixa                  RECORD;
  v_faixa_found            BOOLEAN;
  v_pct                    NUMERIC := 0;
  v_valor                  NUMERIC := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM usuarios WHERE id = auth.uid() AND empresa_id = p_empresa_id AND ativo = true
  ) THEN
    RAISE EXCEPTION 'Acesso negado: empresa_id inválido para este usuário';
  END IF;

  SELECT
    COALESCE(SUM(p.valor_financiado) FILTER (WHERE p.modalidade NOT IN ('Contrato', 'Consorcio')), 0),
    COALESCE(SUM(p.valor_contrato)   FILTER (WHERE p.modalidade = 'Contrato'), 0),
    COALESCE(SUM(p.valor_assessoria), 0)
  INTO v_producao_financiamento, v_producao_contrato, v_producao_assessoria
  FROM processos p
  WHERE p.empresa_id = p_empresa_id
    AND p.comercial_id = p_comercial_usuario_id
    AND p.status_emissao = 'emitido'
    AND p.modalidade <> 'Consorcio'
    AND p.data_emissao IS NOT NULL
    AND EXTRACT(MONTH FROM p.data_emissao) = p_mes
    AND EXTRACT(YEAR  FROM p.data_emissao) = p_ano;

  v_producao_total := v_producao_financiamento + v_producao_contrato + v_producao_assessoria;

  v_func_found  := false;
  v_regra_id    := NULL;
  v_faixa_found := false;

  SELECT f.id AS func_id, COALESCE(f.regra_comissao_id, c.regra_comissao_id) AS regra
  INTO v_func
  FROM rh_funcionarios f
  LEFT JOIN rh_cargos c ON c.id = f.cargo_id
  WHERE f.empresa_id = p_empresa_id
    AND f.email = (SELECT email FROM usuarios WHERE id = p_comercial_usuario_id)
    AND f.status = 'ativo'
  LIMIT 1;

  v_func_found := FOUND;

  IF v_func_found THEN
    v_regra_id := v_func.regra;
  END IF;

  IF v_regra_id IS NOT NULL THEN
    SELECT r.id, r.tipo_calculo INTO v_regra FROM rh_regras_comissao r WHERE r.id = v_regra_id;

    IF FOUND AND v_regra.tipo_calculo = 'percentual_faixa_producao_mensal' THEN
      SELECT *
      INTO v_faixa
      FROM rh_faixas_comissao fx
      WHERE fx.regra_id = v_regra_id
        AND fx.valor_minimo <= v_producao_total
        AND (fx.valor_maximo = 0 OR fx.valor_maximo >= v_producao_total)
      ORDER BY fx.valor_minimo DESC
      LIMIT 1;

      v_faixa_found := FOUND;
      IF v_faixa_found THEN
        v_pct := COALESCE(v_faixa.pct_comercial, v_faixa.percentual, 0);
      END IF;
    END IF;
  END IF;

  v_valor := v_producao_total * v_pct / 100;

  IF v_faixa_found AND v_faixa.piso_valor > 0 THEN
    v_valor := GREATEST(v_valor, v_faixa.piso_valor);
  END IF;
  IF v_faixa_found AND v_faixa.teto_valor > 0 THEN
    v_valor := LEAST(v_valor, v_faixa.teto_valor);
  END IF;

  RETURN QUERY SELECT
    v_producao_total,
    v_pct,
    v_valor,
    v_regra_id,
    CASE WHEN v_func_found THEN v_func.func_id ELSE NULL END;
END;
$$;

CREATE OR REPLACE FUNCTION contas_a_receber_mes_preview(
  p_empresa_id UUID,
  p_mes        INTEGER,
  p_ano        INTEGER
)
RETURNS TABLE (
  id                    UUID,
  processo_id           UUID,
  banco_id              UUID,
  banco_nome            TEXT,
  banco_cor             TEXT,
  cliente_nome          TEXT,
  origem                TEXT,
  valor_base            NUMERIC,
  percentual_previsto   NUMERIC,
  valor_previsto        NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM usuarios WHERE id = auth.uid() AND empresa_id = p_empresa_id AND ativo = true
  ) THEN
    RAISE EXCEPTION 'Acesso negado: empresa_id inválido para este usuário';
  END IF;

  RETURN QUERY
  SELECT
    gen_random_uuid(),
    p.id,
    p.banco_id,
    b.nome,
    b.cor,
    COALESCE(pe.nome, pc.nome, ''),
    'emissao'::TEXT,
    COALESCE(p.valor_financiado, 0),
    COALESCE(cp.comissao_empresa, 0),
    ROUND(COALESCE(p.valor_financiado, 0) * COALESCE(cp.comissao_empresa, 0) / 100, 2)
  FROM processos p
  LEFT JOIN bancos b ON b.id = p.banco_id
  LEFT JOIN pessoas pe ON pe.id = p.pessoa_id
  LEFT JOIN LATERAL (
    SELECT pcomp.nome FROM processo_compradores pcomp
    WHERE pcomp.processo_id = p.id
    ORDER BY pcomp.principal DESC NULLS LAST LIMIT 1
  ) pc ON true
  LEFT JOIN LATERAL (
    SELECT x.comissao_empresa FROM comissoes_padrao x
    WHERE x.banco_id = p.banco_id AND x.empresa_id = p.empresa_id
      AND (x.modalidade = '' OR x.modalidade = p.modalidade::TEXT)
    ORDER BY (x.modalidade <> '') DESC
    LIMIT 1
  ) cp ON true
  WHERE p.empresa_id = p_empresa_id
    AND p.status_emissao = 'emitido'
    AND p.modalidade NOT IN ('Contrato', 'Consorcio')
    AND p.data_emissao IS NOT NULL
    AND EXTRACT(MONTH FROM p.data_emissao) = p_mes
    AND EXTRACT(YEAR  FROM p.data_emissao) = p_ano

  UNION ALL

  SELECT
    gen_random_uuid(),
    p.id,
    NULL, NULL, NULL,
    COALESCE(pe.nome, pc.nome, ''),
    'contrato'::TEXT,
    COALESCE(p.valor_contrato, 0),
    0,
    COALESCE(p.valor_contrato, 0)
  FROM processos p
  LEFT JOIN pessoas pe ON pe.id = p.pessoa_id
  LEFT JOIN LATERAL (
    SELECT pcomp.nome FROM processo_compradores pcomp
    WHERE pcomp.processo_id = p.id
    ORDER BY pcomp.principal DESC NULLS LAST LIMIT 1
  ) pc ON true
  WHERE p.empresa_id = p_empresa_id
    AND p.modalidade = 'Contrato'
    AND p.status_emissao = 'emitido'
    AND p.data_emissao IS NOT NULL
    AND EXTRACT(MONTH FROM p.data_emissao) = p_mes
    AND EXTRACT(YEAR  FROM p.data_emissao) = p_ano;
END;
$$;

-- Mantém as permissões já concedidas na migration 238 (CREATE OR REPLACE
-- preserva GRANTs quando a assinatura não muda), mas reforça por segurança.
GRANT EXECUTE ON FUNCTION calcular_producao_comercial_mes(UUID, UUID, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION contas_a_receber_mes_preview(UUID, INTEGER, INTEGER) TO authenticated;
