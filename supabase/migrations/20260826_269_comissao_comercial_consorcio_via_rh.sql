-- ============================================================
-- Migration 269 — comissão do comercial no Consórcio passa a vir do motor de
-- RH (rh_funcionarios.regra_comissao_id → rh_cargos → rh_regras_comissao →
-- rh_faixas_comissao, tipo_calculo = 'percentual_por_negocio'), com fallback
-- pro campo já existente financeiro_config_consorcio.comissao_comercial_percentual.
--
-- Mudança de fórmula: a comissão do comercial é um percentual APLICADO
-- DIRETO SOBRE O VALOR DA CARTA (v_cota.valor_carta), independente da
-- comissão que a empresa recebe da administradora (v_valor_empresa) — as
-- duas são cálculos paralelos, não uma fatia da outra. Ex.: carta de
-- R$1.000.000, comissão empresa 4% = R$40.000, comissão comercial 2% =
-- R$20.000 (2% da carta, não 2% dos R$40.000).
--
-- Resolução do funcionário pelo e-mail do comercial (mesmo padrão de
-- gerar_comissoes_a_pagar, migration 235) — vinculação por e-mail, não FK.
-- ============================================================

CREATE OR REPLACE FUNCTION gerar_fluxo_financeiro_consorcio(p_processo_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_processo        RECORD;
  v_cota             RECORD;
  v_config           RECORD;
  v_func             RECORD;
  v_regra            RECORD;
  v_faixa            RECORD;
  v_regra_id         UUID;
  v_pct_comercial    NUMERIC(6,3);
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

    -- Comissão da empresa: config por administradora + tipo de bem + tipo de
    -- parcela + vigência (inalterado desde a migration 267).
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

    IF NOT FOUND THEN
      SELECT * INTO v_config
      FROM financeiro_config_consorcio
      WHERE empresa_id = v_processo.empresa_id
        AND administradora_nome IS NULL AND tipo_bem IS NULL AND tipo_parcela IS NULL
      LIMIT 1;
    END IF;

    v_valor_empresa := round(v_cota.valor_carta * COALESCE(v_config.comissao_total_percentual, 4) / 100, 2);

    -- Comissão do comercial: percentual DIRETO sobre o valor da carta,
    -- resolvido pelo funcionário (override) → cargo → regra tipo
    -- 'percentual_por_negocio' → faixa pelo valor da carta. Sem funcionário/
    -- regra/faixa aplicável, cai no fallback de financeiro_config_consorcio
    -- (mesmo campo comissao_comercial_percentual de antes, agora
    -- interpretado como % sobre a carta).
    v_pct_comercial := NULL;

    IF v_processo.comercial_id IS NOT NULL THEN
      SELECT f.*, f.regra_comissao_id AS regra_funcionario, c.regra_comissao_id AS regra_cargo
      INTO v_func
      FROM rh_funcionarios f
      LEFT JOIN rh_cargos c ON c.id = f.cargo_id
      WHERE f.empresa_id = v_processo.empresa_id
        AND f.email = (SELECT email FROM usuarios WHERE id = v_processo.comercial_id)
        AND f.status = 'ativo'
      LIMIT 1;

      IF FOUND THEN
        v_regra_id := COALESCE(v_func.regra_funcionario, v_func.regra_cargo);

        IF v_regra_id IS NOT NULL THEN
          SELECT * INTO v_regra FROM rh_regras_comissao WHERE id = v_regra_id AND ativa = true;

          IF FOUND AND v_regra.tipo_calculo = 'percentual_por_negocio' THEN
            SELECT * INTO v_faixa
            FROM rh_faixas_comissao
            WHERE regra_id = v_regra_id
              AND valor_minimo <= v_cota.valor_carta
              AND (valor_maximo = 0 OR valor_maximo >= v_cota.valor_carta)
            ORDER BY valor_minimo DESC
            LIMIT 1;

            IF FOUND THEN
              v_pct_comercial := v_faixa.pct_comercial;
            END IF;
          END IF;
        END IF;
      END IF;
    END IF;

    v_pct_comercial := COALESCE(v_pct_comercial, v_config.comissao_comercial_percentual, 1);
    v_valor_comercial := round(v_cota.valor_carta * v_pct_comercial / 100, 2);

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
