-- ============================================================
-- Migration 267 — corrige gerar_fluxo_financeiro_consorcio: a resolução de
-- config "específica" (migration 266) usava `tipo_bem = v_cota.tipo_bem` e
-- `tipo_parcela = v_cota.tipo_parcela` com igualdade estrita, mas a UI de
-- Comissões Consórcio permite deixar esses campos em branco ("Qualquer"/
-- "Ambos" = NULL) numa linha por administradora — e NULL nunca é igual a
-- nada em SQL, então essas linhas "coringa" por administradora nunca
-- batiam, caindo sempre no fallback "Padrão/Geral" mesmo quando existia uma
-- config da administradora aplicável.
--
-- Corrige tratando tipo_bem/tipo_parcela NULL na config como "aplica a
-- qualquer valor" (igual ao administradora_nome IS NULL de sempre), e usa
-- ORDER BY pra priorizar a linha mais específica quando mais de uma bate
-- (tipo_bem definido > tipo_bem em branco, tipo_parcela definido > em
-- branco, vigência mais recente por último).
-- ============================================================

CREATE OR REPLACE FUNCTION gerar_fluxo_financeiro_consorcio(p_processo_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_processo        RECORD;
  v_cota             RECORD;
  v_config           RECORD;
  v_data_conclusao   TIMESTAMPTZ := now();
  v_data_ref         DATE;
  v_valor_empresa    NUMERIC(15,2);
  v_valor_comercial  NUMERIC(15,2);
  v_parcela_empresa  NUMERIC(15,2);
  v_parcela_comercial NUMERIC(15,2);
  v_i                INTEGER;
  v_count            INTEGER := 0;
BEGIN
  SELECT p.* INTO v_processo
  FROM processos p
  WHERE p.id = p_processo_id
    AND p.empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Processo não encontrado ou acesso negado';
  END IF;

  IF v_processo.modalidade <> 'Consorcio' THEN
    RAISE EXCEPTION 'Geração de fluxo financeiro de consórcio só se aplica a processos modalidade Consorcio';
  END IF;

  FOR v_cota IN
    SELECT * FROM processo_cotas
    WHERE processo_id = p_processo_id AND status_cota = 'ativo'
  LOOP
    IF v_cota.valor_carta IS NULL OR v_cota.valor_carta <= 0 THEN
      CONTINUE;
    END IF;

    v_data_ref := COALESCE(v_cota.data_pagamento_boleto, CURRENT_DATE);

    -- 1) Específico por administradora: tipo_bem/tipo_parcela em branco na
    -- config = coringa (aplica a qualquer valor da cota); quando batem mais
    -- de uma linha, prioriza a mais específica (campo definido > coringa) e,
    -- por último, a vigência mais recente que cobre a data de referência.
    SELECT * INTO v_config
    FROM financeiro_config_consorcio
    WHERE empresa_id = v_processo.empresa_id
      AND administradora_nome = v_cota.administradora_nome
      AND (tipo_bem IS NULL OR tipo_bem = v_cota.tipo_bem)
      AND (tipo_parcela IS NULL OR tipo_parcela = v_cota.tipo_parcela)
      AND (data_vigencia_inicio IS NULL OR data_vigencia_inicio <= v_data_ref)
      AND (data_vigencia_fim IS NULL OR data_vigencia_fim >= v_data_ref)
    ORDER BY
      (tipo_bem IS NOT NULL) DESC,
      (tipo_parcela IS NOT NULL) DESC,
      data_vigencia_inicio DESC NULLS LAST
    LIMIT 1;

    -- 2) Geral (fallback igual ao de antes).
    IF NOT FOUND THEN
      SELECT * INTO v_config
      FROM financeiro_config_consorcio
      WHERE empresa_id = v_processo.empresa_id
        AND administradora_nome IS NULL AND tipo_bem IS NULL AND tipo_parcela IS NULL
      LIMIT 1;
    END IF;

    -- 3) Hardcoded (fallback final, igual ao de antes) via COALESCE abaixo.

    v_valor_empresa   := round(v_cota.valor_carta * COALESCE(v_config.comissao_total_percentual, 4) / 100, 2);
    v_valor_comercial := round(v_valor_empresa * COALESCE(v_config.comissao_comercial_percentual, 25) / 100, 2);

    DECLARE
      v_n INTEGER := COALESCE(v_config.numero_parcelas_padrao, 13);
    BEGIN
      v_parcela_empresa   := round(v_valor_empresa / v_n, 2);
      v_parcela_comercial := round(v_valor_comercial / v_n, 2);

      FOR v_i IN 1..v_n LOOP
        INSERT INTO financeiro_consorcio_receber (
          empresa_id, processo_id, processo_cota_id,
          numero_parcela, total_parcelas, valor_parcela, data_vencimento
        ) VALUES (
          v_processo.empresa_id, p_processo_id, v_cota.id,
          v_i, v_n,
          CASE WHEN v_i = v_n THEN v_valor_empresa - v_parcela_empresa * (v_n - 1) ELSE v_parcela_empresa END,
          (v_data_conclusao + (v_i || ' months')::INTERVAL)::DATE
        )
        ON CONFLICT (processo_cota_id, numero_parcela) DO NOTHING;

        INSERT INTO financeiro_consorcio_comercial_pagar (
          empresa_id, processo_id, processo_cota_id, usuario_id,
          numero_parcela, total_parcelas, valor_parcela, data_vencimento
        ) VALUES (
          v_processo.empresa_id, p_processo_id, v_cota.id, v_processo.comercial_id,
          v_i, v_n,
          CASE WHEN v_i = v_n THEN v_valor_comercial - v_parcela_comercial * (v_n - 1) ELSE v_parcela_comercial END,
          (v_data_conclusao + (v_i || ' months')::INTERVAL)::DATE
        )
        ON CONFLICT (processo_cota_id, numero_parcela) DO NOTHING;

        v_count := v_count + 2;
      END LOOP;
    END;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
