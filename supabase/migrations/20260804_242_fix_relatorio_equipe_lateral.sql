-- Migration 242: Fix relatorio_equipe (comissao_gerada zerada no branch ao vivo)
--
-- A migration 241 chamava calcular_producao_comercial_mes via
-- `LEFT JOIN LATERAL ... ON true` dentro de um RETURN QUERY SELECT com
-- GROUP BY + MAX(prod.comissao_total). Reconstruindo a mesma lógica
-- manualmente (sem passar pela função) o valor bate certinho (R$500), mas
-- pela função de verdade (via app, sessão autenticada) vinha 0 — a
-- combinação LATERAL-de-função-SECURITY-DEFINER + GROUP BY/MAX não estava
-- se comportando como o SQL puro equivalente.
--
-- Todo outro lugar que já chama calcular_producao_comercial_mes com sucesso
-- (comissao_comercial_calculada, comissoes_a_pagar_mes_preview) usa o
-- padrão imperativo `SELECT * INTO v_prod FROM calcular_producao_comercial_mes(...)`
-- dentro de um LOOP, não LATERAL JOIN declarativo. Troca pro mesmo padrão
-- já comprovado.

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
  v_fechamento     RECORD;
  v_snapshot       BOOLEAN;
  v_com            RECORD;
  v_prod           RECORD;
  v_num_contratos  BIGINT;
  v_valor_emitido  NUMERIC;
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
  ELSE
    FOR v_com IN
      SELECT DISTINCT p.comercial_id, u.nome AS comercial_nome
      FROM processos p
      JOIN usuarios u ON u.id = p.comercial_id
      WHERE p.empresa_id = p_empresa_id
        AND p.comercial_id IS NOT NULL
        AND p.status_emissao = 'emitido'
        AND p.modalidade <> 'Consorcio'
        AND p.data_emissao IS NOT NULL
        AND EXTRACT(MONTH FROM p.data_emissao) = p_mes
        AND EXTRACT(YEAR  FROM p.data_emissao) = p_ano
    LOOP
      SELECT
        COUNT(*),
        COALESCE(SUM(CASE WHEN p.modalidade = 'Contrato' THEN p.valor_contrato ELSE p.valor_financiado END), 0)
      INTO v_num_contratos, v_valor_emitido
      FROM processos p
      WHERE p.empresa_id = p_empresa_id
        AND p.comercial_id = v_com.comercial_id
        AND p.status_emissao = 'emitido'
        AND p.modalidade <> 'Consorcio'
        AND p.data_emissao IS NOT NULL
        AND EXTRACT(MONTH FROM p.data_emissao) = p_mes
        AND EXTRACT(YEAR  FROM p.data_emissao) = p_ano;

      SELECT * INTO v_prod
      FROM calcular_producao_comercial_mes(p_empresa_id, v_com.comercial_id, p_mes, p_ano);

      comercial_id      := v_com.comercial_id;
      comercial_nome    := v_com.comercial_nome;
      num_contratos     := v_num_contratos;
      valor_emitido     := v_valor_emitido;
      comissao_gerada   := COALESCE(v_prod.comissao_total, 0);
      comissao_recebida := 0;
      RETURN NEXT;
    END LOOP;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION relatorio_equipe(UUID, INTEGER, INTEGER) TO authenticated;
