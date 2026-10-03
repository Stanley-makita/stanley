-- ============================================================
-- 337 — Comissão de consórcio: a configuração por administradora passa a ser encontrada (03/10/2026).
--
-- Achado: gerar_fluxo_financeiro_consorcio comparava administradora_nome letra por letra — a
-- configuração (Configurações › Comissões Consórcio) estava como "itau" e as 75 cotas como "Itaú",
-- então NENHUMA cota achou configuração e as 975 parcelas usaram o fixo de reserva (4% empresa,
-- 1% comercial, 13 parcelas). Agora:
--   1. administradora e tipo de bem comparados sem maiúscula/acento/espaço (normalizar_texto_config);
--   2. a regra de Consórcio do RH respeita a vigência (data_inicio/data_termino), como a configuração.
-- Tipo de parcela continua contando (decisão do Marcio): combinações sem linha própria caem na
-- "Padrão/Geral" — cadastrar as que faltam ANTES de recalcular.
-- Função gerada a partir da última definição (307) + os 2 ajustes. NÃO recalcula nada sozinha:
-- recalcular é o script supabase/2026-10-09_recalcular_fluxos_consorcio.sql (simulação primeiro).
-- ============================================================

CREATE OR REPLACE FUNCTION normalizar_texto_config(p text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT nullif(lower(btrim(translate(coalesce(p, ''),
    'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç',
    'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'))), '')
$$;

CREATE OR REPLACE FUNCTION gerar_fluxo_financeiro_consorcio(p_processo_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_processo        RECORD;
  v_cota             RECORD;
  v_config           RECORD;
  v_func_id          UUID;
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

    SELECT * INTO v_config
    FROM financeiro_config_consorcio
    WHERE empresa_id = v_processo.empresa_id
      -- 337: sem diferenciar maiúscula/acento/espaço ("itau" = "Itaú") — antes nunca casava e caía no fixo 4%/1%/13x.
      AND normalizar_texto_config(administradora_nome) = normalizar_texto_config(v_cota.administradora_nome)
      AND (tipo_bem IS NULL OR normalizar_texto_config(tipo_bem) = normalizar_texto_config(v_cota.tipo_bem))
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
    -- resolvido pela regra de categoria 'consorcio' do funcionário
    -- (override) → cargo (default) → faixa pelo valor da carta. Sem
    -- funcionário/regra/faixa aplicável, cai no fallback de
    -- financeiro_config_consorcio (mesmo campo comissao_comercial_percentual
    -- de antes).
    v_pct_comercial := NULL;

    IF v_processo.comercial_id IS NOT NULL THEN
      SELECT f.id INTO v_func_id
      FROM usuarios u2
      JOIN rh_funcionarios f ON f.id = u2.funcionario_id
      WHERE u2.id = v_processo.comercial_id
        AND f.empresa_id = v_processo.empresa_id
        AND f.status = 'ativo'
      LIMIT 1;

      IF FOUND THEN
        v_regra_id := resolver_regra_comissao(v_func_id, 'consorcio');

        IF v_regra_id IS NOT NULL THEN
          -- 337: respeita a vigência da regra do RH (antes só olhava 'ativa'), mesma data de referência da config.
          SELECT * INTO v_regra FROM rh_regras_comissao WHERE id = v_regra_id AND ativa = true
            AND (data_inicio IS NULL OR data_inicio <= v_data_ref)
            AND (data_termino IS NULL OR data_termino >= v_data_ref);

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
