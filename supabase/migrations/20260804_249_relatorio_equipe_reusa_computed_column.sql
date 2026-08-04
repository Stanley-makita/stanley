-- Migration 249: relatorio_equipe passa a reaproveitar comissao_comercial_calculada
--
-- Em vez de duplicar a lógica de produção/faixa/piso/teto (onde os bugs
-- foram aparecendo), soma direto o mesmo valor por processo que a tabela
-- de Negócios > Financiamento já usa e mostra corretamente
-- (comissao_comercial_calculada, computed column sobre `processos`).
-- Única fonte de verdade, sem lógica duplicada.

DROP FUNCTION IF EXISTS relatorio_equipe(uuid, integer, integer);

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
DECLARE
  v_fechamento RECORD;
  v_snapshot   BOOLEAN;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM usuarios WHERE id = auth.uid() AND empresa_id = p_empresa_id AND ativo = true
  ) THEN
    RAISE EXCEPTION 'Acesso negado: empresa_id inválido para este usuário';
  END IF;

  SELECT * INTO v_fechamento
  FROM financeiro_fechamentos
  WHERE empresa_id = p_empresa_id AND competencia_mes = p_mes AND competencia_ano = p_ano;

  v_snapshot := FOUND AND v_fechamento.status IN ('aprovado', 'pago', 'travado');

  IF v_snapshot THEN
    RETURN QUERY
    SELECT
      fp.comercial_id,
      u.nome AS comercial_nome,
      COUNT(DISTINCT fp.processo_id)                                                     AS num_contratos,
      COALESCE(SUM(fp.valor_financiado), 0)                                               AS valor_emitido,
      COALESCE(MAX(cp.valor_final), 0)                                                    AS comissao_gerada,
      COALESCE(MAX(cp.valor_final) FILTER (WHERE cp.status = 'paga'), 0)                   AS comissao_recebida
    FROM financeiro_fechamento_processos fp
    JOIN usuarios u ON u.id = fp.comercial_id
    LEFT JOIN financeiro_comissoes_pagar cp
      ON cp.fechamento_id = fp.fechamento_id
     AND cp.usuario_id = fp.comercial_id
     AND cp.papel = 'comercial'
    WHERE fp.fechamento_id = v_fechamento.id
      AND fp.comercial_id IS NOT NULL
    GROUP BY fp.comercial_id, u.nome
    ORDER BY comissao_gerada DESC;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    p.comercial_id,
    u.nome AS comercial_nome,
    COUNT(p.id)                                                                          AS num_contratos,
    COALESCE(SUM(CASE WHEN p.modalidade = 'Contrato' THEN p.valor_contrato ELSE p.valor_financiado END), 0) AS valor_emitido,
    COALESCE(SUM(comissao_comercial_calculada(p)), 0)                                    AS comissao_gerada,
    0::NUMERIC                                                                            AS comissao_recebida
  FROM processos p
  JOIN usuarios u ON u.id = p.comercial_id
  WHERE p.empresa_id = p_empresa_id
    AND p.comercial_id IS NOT NULL
    AND p.status_emissao = 'emitido'
    AND p.modalidade <> 'Consorcio'
    AND p.data_emissao IS NOT NULL
    AND EXTRACT(MONTH FROM p.data_emissao) = p_mes
    AND EXTRACT(YEAR  FROM p.data_emissao) = p_ano
  GROUP BY p.comercial_id, u.nome
  ORDER BY comissao_gerada DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION relatorio_equipe(UUID, INTEGER, INTEGER) TO authenticated;
