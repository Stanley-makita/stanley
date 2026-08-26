-- ============================================================
-- Migration 266 — Comissão do Consórcio parametrizada por administradora +
-- tipo de bem + tipo de parcela (linear/reduzida) + vigência (data de
-- pagamento do boleto da cota decide qual regra vigente se aplica).
--
-- Motivo: cada administradora tem regras diferentes por tipo de bem e por
-- tipo de parcela, e essas regras mudam ao longo do tempo (ex.: cartas do
-- Itaú contratadas até dez/2025 pagam em 13 meses, a partir de jan/2026 em
-- 12). A config antiga só distinguia por administradora, sem essas
-- dimensões — dava pra resolver comissão errada silenciosamente.
-- ============================================================

-- processo_cotas: tipo de parcela explícito (não inferir pelo percentual) e
-- data de pagamento do boleto (gatilho que decide a vigência aplicável).
ALTER TABLE processo_cotas ADD COLUMN tipo_parcela TEXT CHECK (tipo_parcela IN ('linear', 'reduzida'));

UPDATE processo_cotas SET tipo_parcela = CASE
  WHEN parcela_reduzida_percentual IS NOT NULL AND parcela_reduzida_percentual > 0 THEN 'reduzida'
  ELSE 'linear'
END;

ALTER TABLE processo_cotas ALTER COLUMN tipo_parcela SET NOT NULL;
ALTER TABLE processo_cotas ALTER COLUMN tipo_parcela SET DEFAULT 'linear';

ALTER TABLE processo_cotas ADD COLUMN data_pagamento_boleto DATE;

-- financeiro_config_consorcio: dimensões novas de match + vigência.
ALTER TABLE financeiro_config_consorcio ADD COLUMN tipo_bem TEXT; -- NULL = qualquer tipo de bem
ALTER TABLE financeiro_config_consorcio ADD COLUMN tipo_parcela TEXT CHECK (tipo_parcela IN ('linear', 'reduzida')); -- NULL = ambos
ALTER TABLE financeiro_config_consorcio ADD COLUMN data_vigencia_inicio DATE; -- NULL = sem limite inferior
ALTER TABLE financeiro_config_consorcio ADD COLUMN data_vigencia_fim DATE;    -- NULL = ainda vigente

-- Os índices únicos antigos assumiam 1 linha por administradora — não vale
-- mais (agora várias linhas por administradora, uma por combinação de tipo
-- de bem/parcela/vigência). Mantém só a garantia de 1 linha "geral" pura.
DROP INDEX IF EXISTS ux_fin_config_consorcio_administradora;
DROP INDEX IF EXISTS ux_fin_config_consorcio_geral;
CREATE UNIQUE INDEX ux_fin_config_consorcio_geral
  ON financeiro_config_consorcio(empresa_id)
  WHERE administradora_nome IS NULL AND tipo_bem IS NULL AND tipo_parcela IS NULL;

-- ============================================================
-- gerar_fluxo_financeiro_consorcio: resolução de config agora considera
-- tipo_bem + tipo_parcela + vigência (pela data_pagamento_boleto da cota),
-- com fallback pra linha "geral" e por último os defaults hardcoded — mesma
-- hierarquia de antes, só que o nível "específico" ficou mais fino.
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

    -- 1) Específico: administradora + tipo de bem + tipo de parcela, dentro
    -- da vigência que cobre a data de pagamento do boleto. Pode haver mais
    -- de uma vigência cadastrada pra mesma combinação (regra mudou com o
    -- tempo) — pega a mais recente que ainda cobre a data de referência.
    SELECT * INTO v_config
    FROM financeiro_config_consorcio
    WHERE empresa_id = v_processo.empresa_id
      AND administradora_nome = v_cota.administradora_nome
      AND tipo_bem = v_cota.tipo_bem
      AND tipo_parcela = v_cota.tipo_parcela
      AND (data_vigencia_inicio IS NULL OR data_vigencia_inicio <= v_data_ref)
      AND (data_vigencia_fim IS NULL OR data_vigencia_fim >= v_data_ref)
    ORDER BY data_vigencia_inicio DESC NULLS LAST
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

-- ============================================================
-- recalcular_fluxo_financeiro_consorcio: apaga as parcelas ainda 'prevista'
-- do processo e chama gerar_fluxo_financeiro_consorcio de novo — usado
-- quando a config/dados da cota mudam depois da primeira geração (o
-- ON CONFLICT DO NOTHING da função acima trava re-geração automática).
-- Bloqueia se já existir parcela recebida/paga (evita reindexar
-- numero_parcela/total_parcelas por baixo de histórico já consolidado).
-- ============================================================

CREATE OR REPLACE FUNCTION recalcular_fluxo_financeiro_consorcio(p_processo_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_processo RECORD;
BEGIN
  SELECT p.* INTO v_processo
  FROM processos p
  WHERE p.id = p_processo_id
    AND p.empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Processo não encontrado ou acesso negado';
  END IF;

  IF v_processo.modalidade <> 'Consorcio' THEN
    RAISE EXCEPTION 'Recalcular fluxo financeiro só se aplica a processos modalidade Consorcio';
  END IF;

  IF EXISTS (
    SELECT 1 FROM financeiro_consorcio_receber WHERE processo_id = p_processo_id AND status <> 'prevista'
    UNION ALL
    SELECT 1 FROM financeiro_consorcio_comercial_pagar WHERE processo_id = p_processo_id AND status <> 'prevista'
  ) THEN
    RAISE EXCEPTION 'Existem parcelas já recebidas/pagas para este processo — não é possível recalcular automaticamente.';
  END IF;

  DELETE FROM financeiro_consorcio_receber WHERE processo_id = p_processo_id AND status = 'prevista';
  DELETE FROM financeiro_consorcio_comercial_pagar WHERE processo_id = p_processo_id AND status = 'prevista';

  RETURN gerar_fluxo_financeiro_consorcio(p_processo_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
