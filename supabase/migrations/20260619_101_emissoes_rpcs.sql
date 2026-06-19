-- Corrige nomes de colunas do resumo_estoque para bater com o tipo TypeScript
CREATE OR REPLACE FUNCTION resumo_estoque(p_empresa_id UUID)
RETURNS TABLE (
  certeza_total    BIGINT,
  certeza_valor    NUMERIC,
  incerteza_total  BIGINT,
  incerteza_valor  NUMERIC,
  total_estoque    BIGINT,
  total_valor      NUMERIC
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
    COUNT(*) FILTER (WHERE chance_emissao = 'certeza')                              AS certeza_total,
    COALESCE(SUM(valor_financiado) FILTER (WHERE chance_emissao = 'certeza'), 0)    AS certeza_valor,
    COUNT(*) FILTER (WHERE chance_emissao = 'incerteza')                            AS incerteza_total,
    COALESCE(SUM(valor_financiado) FILTER (WHERE chance_emissao = 'incerteza'), 0)  AS incerteza_valor,
    COUNT(*)                                                                         AS total_estoque,
    COALESCE(SUM(valor_financiado), 0)                                              AS total_valor
  FROM processos
  WHERE empresa_id = p_empresa_id
    AND deleted_at IS NULL
    AND status_processo NOT IN ('reprovado', 'cancelado');
END;
$$;

-- emissoes_por_semana: agrupa processos emitidos por semana dentro do mês
CREATE OR REPLACE FUNCTION emissoes_por_semana(
  p_empresa_id UUID,
  p_mes        INT,
  p_ano        INT
)
RETURNS TABLE (
  emitidos              BIGINT,
  producao              NUMERIC,
  emitidos_ate          DATE,
  percentual_valor      NUMERIC,
  percentual_contratos  NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_emitidos BIGINT;
  v_total_producao NUMERIC;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM usuarios
    WHERE id = auth.uid() AND empresa_id = p_empresa_id AND ativo = true
  ) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT COUNT(*), COALESCE(SUM(valor_financiado), 0)
  INTO v_total_emitidos, v_total_producao
  FROM processos
  WHERE empresa_id = p_empresa_id
    AND deleted_at IS NULL
    AND status_emissao = 'emitido'
    AND EXTRACT(MONTH FROM data_emissao) = p_mes
    AND EXTRACT(YEAR  FROM data_emissao) = p_ano;

  RETURN QUERY
  WITH semanas AS (
    SELECT
      CASE
        WHEN EXTRACT(DAY FROM data_emissao) <= 7  THEN 1
        WHEN EXTRACT(DAY FROM data_emissao) <= 14 THEN 2
        WHEN EXTRACT(DAY FROM data_emissao) <= 21 THEN 3
        ELSE 4
      END AS semana,
      valor_financiado
    FROM processos
    WHERE empresa_id = p_empresa_id
      AND deleted_at IS NULL
      AND status_emissao = 'emitido'
      AND EXTRACT(MONTH FROM data_emissao) = p_mes
      AND EXTRACT(YEAR  FROM data_emissao) = p_ano
  ),
  agregado AS (
    SELECT
      semana,
      COUNT(*)::BIGINT            AS qtd,
      COALESCE(SUM(valor_financiado), 0) AS prod
    FROM semanas
    GROUP BY semana
  )
  SELECT
    a.qtd,
    a.prod,
    CASE a.semana
      WHEN 1 THEN make_date(p_ano, p_mes, 7)
      WHEN 2 THEN make_date(p_ano, p_mes, 14)
      WHEN 3 THEN make_date(p_ano, p_mes, 21)
      ELSE (make_date(p_ano, p_mes, 1) + INTERVAL '1 month - 1 day')::DATE
    END AS emitidos_ate,
    CASE WHEN v_total_producao > 0
      THEN ROUND((a.prod / v_total_producao * 100)::NUMERIC, 2)
      ELSE 0
    END,
    CASE WHEN v_total_emitidos > 0
      THEN ROUND((a.qtd::NUMERIC / v_total_emitidos * 100)::NUMERIC, 2)
      ELSE 0
    END
  FROM agregado a
  ORDER BY a.semana;
END;
$$;

-- performance_por_banco: breakdown de emissões por banco no mês
CREATE OR REPLACE FUNCTION performance_por_banco(
  p_empresa_id UUID,
  p_mes        INT,
  p_ano        INT
)
RETURNS TABLE (
  banco_nome            TEXT,
  banco_cor             TEXT,
  realizado             NUMERIC,
  percentual_valor      NUMERIC,
  num_contratos         BIGINT,
  percentual_contratos  NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_emitidos BIGINT;
  v_total_valor    NUMERIC;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM usuarios
    WHERE id = auth.uid() AND empresa_id = p_empresa_id AND ativo = true
  ) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT COUNT(*), COALESCE(SUM(p.valor_financiado), 0)
  INTO v_total_emitidos, v_total_valor
  FROM processos p
  WHERE p.empresa_id = p_empresa_id
    AND p.deleted_at IS NULL
    AND p.status_emissao = 'emitido'
    AND EXTRACT(MONTH FROM p.data_emissao) = p_mes
    AND EXTRACT(YEAR  FROM p.data_emissao) = p_ano;

  RETURN QUERY
  SELECT
    COALESCE(b.nome, 'Sem banco')          AS banco_nome,
    b.cor                                  AS banco_cor,
    COALESCE(SUM(p.valor_financiado), 0)   AS realizado,
    CASE WHEN v_total_valor > 0
      THEN ROUND((COALESCE(SUM(p.valor_financiado), 0) / v_total_valor * 100)::NUMERIC, 3)
      ELSE 0
    END                                    AS percentual_valor,
    COUNT(p.id)::BIGINT                    AS num_contratos,
    CASE WHEN v_total_emitidos > 0
      THEN ROUND((COUNT(p.id)::NUMERIC / v_total_emitidos * 100)::NUMERIC, 3)
      ELSE 0
    END                                    AS percentual_contratos
  FROM processos p
  LEFT JOIN bancos b ON b.id = p.banco_id
  WHERE p.empresa_id = p_empresa_id
    AND p.deleted_at IS NULL
    AND p.status_emissao = 'emitido'
    AND EXTRACT(MONTH FROM p.data_emissao) = p_mes
    AND EXTRACT(YEAR  FROM p.data_emissao) = p_ano
  GROUP BY b.nome, b.cor
  ORDER BY realizado DESC;
END;
$$;
