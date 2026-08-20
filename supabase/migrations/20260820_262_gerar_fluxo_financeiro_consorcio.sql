-- ============================================================
-- Migration 262 — Financeiro de Consórcio: RPC de geração automática
-- do fluxo (a receber da empresa + a pagar do comercial), disparada quando
-- o processo entra na fase marcada como final do módulo Consórcio (ver
-- fases.e_fase_final_consorcio, migration 260) — ver chamada em
-- src/hooks/processos/useProcessoFasesHistorico.ts.
-- ============================================================

CREATE OR REPLACE FUNCTION gerar_fluxo_financeiro_consorcio(p_processo_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_processo        RECORD;
  v_cota             RECORD;
  v_config           RECORD;
  v_data_conclusao   TIMESTAMPTZ := now();
  v_valor_empresa    NUMERIC(15,2);
  v_valor_comercial  NUMERIC(15,2);
  v_parcela_empresa  NUMERIC(15,2);
  v_parcela_comercial NUMERIC(15,2);
  v_i                INTEGER;
  v_count            INTEGER := 0;
BEGIN
  -- Carrega o processo e valida acesso (usuário chamador precisa ser da
  -- mesma empresa) e modalidade.
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

  -- Uma cota por vez: cada cota ativa do processo pode ter uma administradora
  -- diferente (config de % e nº de parcelas diferente).
  FOR v_cota IN
    SELECT * FROM processo_cotas
    WHERE processo_id = p_processo_id AND status_cota = 'ativo'
  LOOP
    IF v_cota.valor_carta IS NULL OR v_cota.valor_carta <= 0 THEN
      CONTINUE;  -- cota sem valor de carta não gera fluxo — nada a calcular
    END IF;

    -- Resolve config: administradora específica → linha "geral" (administradora_nome
    -- IS NULL) → defaults hardcoded 4%/25%/13 se a empresa nunca configurou nada.
    SELECT * INTO v_config
    FROM financeiro_config_consorcio
    WHERE empresa_id = v_processo.empresa_id
      AND administradora_nome = v_cota.administradora_nome
    LIMIT 1;

    IF NOT FOUND THEN
      SELECT * INTO v_config
      FROM financeiro_config_consorcio
      WHERE empresa_id = v_processo.empresa_id AND administradora_nome IS NULL
      LIMIT 1;
    END IF;

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
          -- última parcela absorve o resto de arredondamento
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
-- Trigger: cancela em cascata as parcelas futuras (status 'prevista') de uma
-- cota quando ela vira 'cancelado'/'substituido'. Parcelas já 'recebida'/
-- 'paga' ficam intactas no histórico.
-- ============================================================

CREATE OR REPLACE FUNCTION fn_cancelar_parcelas_cota_consorcio()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status_cota IN ('cancelado', 'substituido') AND OLD.status_cota <> NEW.status_cota THEN
    UPDATE financeiro_consorcio_receber
      SET status = 'cancelada', updated_at = now()
      WHERE processo_cota_id = NEW.id AND status = 'prevista';
    UPDATE financeiro_consorcio_comercial_pagar
      SET status = 'cancelada', updated_at = now()
      WHERE processo_cota_id = NEW.id AND status = 'prevista';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_cancelar_parcelas_cota_consorcio
  AFTER UPDATE OF status_cota ON processo_cotas
  FOR EACH ROW EXECUTE FUNCTION fn_cancelar_parcelas_cota_consorcio();
