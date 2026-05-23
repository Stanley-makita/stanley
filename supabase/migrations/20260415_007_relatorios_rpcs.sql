-- ============================================================
-- Migration: 20260415_007_relatorios_rpcs.sql
-- Módulo: Relatórios — 4 RPCs somente leitura
-- ============================================================

CREATE OR REPLACE FUNCTION relatorio_producao_mensal(
  p_empresa_id UUID,
  p_ano        INTEGER
)
RETURNS TABLE (
  mes               INTEGER,
  emissoes          BIGINT,
  valor_total       NUMERIC,
  leads_criados     BIGINT,
  leads_convertidos BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM usuarios
    WHERE id = auth.uid() AND empresa_id = p_empresa_id AND ativo = true
  ) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  RETURN QUERY
  WITH serie AS (
    SELECT generate_series(1, 12) AS mes
  ),
  emissoes_agg AS (
    SELECT
      EXTRACT(MONTH FROM data_emissao)::INTEGER AS mes,
      COUNT(*)                                AS emissoes,
      COALESCE(SUM(valor_financiado), 0)      AS valor_total
    FROM processos
    WHERE empresa_id  = p_empresa_id
      AND status_emissao = 'emitido'
      AND EXTRACT(YEAR FROM data_emissao) = p_ano
    GROUP BY EXTRACT(MONTH FROM data_emissao)
  ),
  leads_agg AS (
    SELECT
      EXTRACT(MONTH FROM created_at)::INTEGER AS mes,
      COUNT(*)                               AS leads_criados,
      COUNT(*) FILTER (
        WHERE id IN (
          SELECT lead_id FROM processos
          WHERE empresa_id = p_empresa_id
            AND lead_id IS NOT NULL
        )
      )                                      AS leads_convertidos
    FROM leads
    WHERE empresa_id = p_empresa_id
      AND EXTRACT(YEAR FROM created_at) = p_ano
    GROUP BY EXTRACT(MONTH FROM created_at)
  )
  SELECT
    s.mes,
    COALESCE(e.emissoes, 0)          AS emissoes,
    COALESCE(e.valor_total, 0)       AS valor_total,
    COALESCE(l.leads_criados, 0)     AS leads_criados,
    COALESCE(l.leads_convertidos, 0) AS leads_convertidos
  FROM serie s
  LEFT JOIN emissoes_agg e ON e.mes = s.mes
  LEFT JOIN leads_agg    l ON l.mes = s.mes
  ORDER BY s.mes;
END;
$$;

CREATE OR REPLACE FUNCTION relatorio_por_banco(
  p_empresa_id  UUID,
  p_data_inicio DATE,
  p_data_fim    DATE
)
RETURNS TABLE (
  banco_id       UUID,
  banco_nome     TEXT,
  num_contratos  BIGINT,
  valor_total    NUMERIC,
  pct_total      NUMERIC,
  ticket_medio   NUMERIC,
  comissao_gerada NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_geral NUMERIC;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM usuarios
    WHERE id = auth.uid() AND empresa_id = p_empresa_id AND ativo = true
  ) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT COALESCE(SUM(p.valor_financiado), 0)
  INTO v_total_geral
  FROM processos p
  WHERE p.empresa_id    = p_empresa_id
    AND p.status_emissao = 'emitido'
    AND p.data_emissao BETWEEN p_data_inicio AND p_data_fim;

  RETURN QUERY
  SELECT
    b.id                                                       AS banco_id,
    b.nome                                                     AS banco_nome,
    COUNT(p.id)                                                AS num_contratos,
    COALESCE(SUM(p.valor_financiado), 0)                       AS valor_total,
    CASE WHEN v_total_geral > 0
         THEN ROUND((COALESCE(SUM(p.valor_financiado), 0) / v_total_geral) * 100, 2)
         ELSE 0
    END                                                        AS pct_total,
    CASE WHEN COUNT(p.id) > 0
         THEN ROUND(COALESCE(SUM(p.valor_financiado), 0) / COUNT(p.id), 2)
         ELSE 0
    END                                                        AS ticket_medio,
    COALESCE(
      (
        SELECT SUM(c.valor_bruto)
        FROM comissoes c
        JOIN processos p2 ON p2.id = c.processo_id
        WHERE p2.banco_id     = b.id
          AND p2.empresa_id   = p_empresa_id
          AND p2.data_emissao BETWEEN p_data_inicio AND p_data_fim
      ),
      0
    )                                                          AS comissao_gerada
  FROM bancos b
  JOIN processos p ON p.banco_id = b.id
  WHERE p.empresa_id    = p_empresa_id
    AND p.status_emissao = 'emitido'
    AND p.data_emissao BETWEEN p_data_inicio AND p_data_fim
  GROUP BY b.id, b.nome
  ORDER BY valor_total DESC;
END;
$$;

CREATE OR REPLACE FUNCTION relatorio_por_modalidade(
  p_empresa_id  UUID,
  p_data_inicio DATE,
  p_data_fim    DATE
)
RETURNS TABLE (
  modalidade    TEXT,
  num_contratos BIGINT,
  valor_total   NUMERIC,
  pct_total     NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_geral NUMERIC;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM usuarios
    WHERE id = auth.uid() AND empresa_id = p_empresa_id AND ativo = true
  ) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT COALESCE(SUM(valor_financiado), 0)
  INTO v_total_geral
  FROM processos
  WHERE empresa_id    = p_empresa_id
    AND status_emissao = 'emitido'
    AND data_emissao BETWEEN p_data_inicio AND p_data_fim;

  RETURN QUERY
  SELECT
    p.modalidade::TEXT                                         AS modalidade,
    COUNT(p.id)                                                AS num_contratos,
    COALESCE(SUM(p.valor_financiado), 0)                       AS valor_total,
    CASE WHEN v_total_geral > 0
         THEN ROUND((COALESCE(SUM(p.valor_financiado), 0) / v_total_geral) * 100, 2)
         ELSE 0
    END                                                        AS pct_total
  FROM processos p
  WHERE p.empresa_id    = p_empresa_id
    AND p.status_emissao = 'emitido'
    AND p.data_emissao BETWEEN p_data_inicio AND p_data_fim
  GROUP BY p.modalidade
  ORDER BY valor_total DESC;
END;
$$;

CREATE OR REPLACE FUNCTION relatorio_por_equipe(
  p_empresa_id  UUID,
  p_data_inicio DATE,
  p_data_fim    DATE
)
RETURNS TABLE (
  comercial_id     UUID,
  comercial_nome   TEXT,
  posicao          BIGINT,
  num_contratos    BIGINT,
  valor_emitido    NUMERIC,
  comissao         NUMERIC,
  leads_criados    BIGINT,
  leads_convertidos BIGINT,
  taxa_conversao   NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM usuarios
    WHERE id = auth.uid() AND empresa_id = p_empresa_id AND ativo = true
  ) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  RETURN QUERY
  WITH emissoes_comercial AS (
    SELECT
      p.comercial_id                       AS comercial_id,
      COUNT(p.id)                          AS num_contratos,
      COALESCE(SUM(p.valor_financiado), 0) AS valor_emitido,
      COALESCE(
        SUM(c.valor_bruto) FILTER (WHERE c.id IS NOT NULL),
        0
      )                                    AS comissao
    FROM processos p
    LEFT JOIN comissoes c ON c.processo_id = p.id
    WHERE p.empresa_id    = p_empresa_id
      AND p.status_emissao = 'emitido'
      AND p.data_emissao BETWEEN p_data_inicio AND p_data_fim
    GROUP BY p.comercial_id
  ),
  leads_comercial AS (
    SELECT
      l.responsavel_id                     AS comercial_id,
      COUNT(l.id)                          AS leads_criados,
      COUNT(l.id) FILTER (
        WHERE l.id IN (
          SELECT lead_id FROM processos
          WHERE empresa_id = p_empresa_id
            AND lead_id IS NOT NULL
        )
      )                                    AS leads_convertidos
    FROM leads l
    WHERE l.empresa_id = p_empresa_id
      AND l.created_at BETWEEN p_data_inicio AND p_data_fim
    GROUP BY l.responsavel_id
  )
  SELECT
    u.id                                                         AS comercial_id,
    u.nome                                                       AS comercial_nome,
    RANK() OVER (ORDER BY COALESCE(ec.valor_emitido, 0) DESC)    AS posicao,
    COALESCE(ec.num_contratos, 0)                                AS num_contratos,
    COALESCE(ec.valor_emitido, 0)                                AS valor_emitido,
    COALESCE(ec.comissao, 0)                                     AS comissao,
    COALESCE(lc.leads_criados, 0)                                AS leads_criados,
    COALESCE(lc.leads_convertidos, 0)                            AS leads_convertidos,
    CASE WHEN COALESCE(lc.leads_criados, 0) > 0
         THEN ROUND(
           (COALESCE(lc.leads_convertidos, 0)::NUMERIC /
            lc.leads_criados::NUMERIC) * 100,
           1
         )
         ELSE 0
    END                                                          AS taxa_conversao
  FROM usuarios u
  LEFT JOIN emissoes_comercial ec ON ec.comercial_id = u.id
  LEFT JOIN leads_comercial    lc ON lc.comercial_id = u.id
  WHERE u.empresa_id = p_empresa_id
    AND u.ativo      = true
    AND u.perfil     IN ('comercial', 'admin', 'gerente')
    AND (ec.num_contratos > 0 OR lc.leads_criados > 0)
  ORDER BY valor_emitido DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION relatorio_producao_mensal(UUID, INTEGER)     TO authenticated;
GRANT EXECUTE ON FUNCTION relatorio_por_banco(UUID, DATE, DATE)         TO authenticated;
GRANT EXECUTE ON FUNCTION relatorio_por_modalidade(UUID, DATE, DATE)    TO authenticated;
GRANT EXECUTE ON FUNCTION relatorio_por_equipe(UUID, DATE, DATE)        TO authenticated;
