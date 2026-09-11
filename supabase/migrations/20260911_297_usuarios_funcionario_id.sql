-- Migration 297: FK real usuarios.funcionario_id -> rh_funcionarios(id)
--
-- Até aqui, o vínculo entre um usuário comercial (processos.comercial_id,
-- que referencia usuarios) e o funcionário correspondente no RH
-- (rh_funcionarios.regra_comissao_id, de onde vem a regra de comissão por
-- faixa) era resolvido em runtime por match de e-mail
-- (lower(f.email) = lower(u.email)), sem nenhuma FK. Isso já causou 4
-- casos reais de comissão zerada: 2 usuários comerciais sem nenhum
-- rh_funcionarios cadastrado, 1 com e-mail de login pessoal diferente do
-- e-mail corporativo do funcionário, e 1 caso à parte (fora do escopo
-- desta migration — precisa de modelo de múltiplas regras por produto).
--
-- Esta migration:
--   1. Adiciona usuarios.funcionario_id (FK real) + índice único parcial
--      (garante 1 funcionário <-> no máximo 1 usuário ativo, fecha a
--      janela de corrida da checagem "já vinculado" feita em
--      /api/admin/usuarios).
--   2. Faz backfill idempotente pros pares que já batem por e-mail hoje
--      (preserva casos já corretos, ex.: Andresa; usa lower() porque a
--      resolução por e-mail nova é o ponto de corte — daqui pra frente
--      o vínculo é por FK, não mais por string, então não há motivo pra
--      manter a divergência de case como uma comissão zerada a mais).
--   3. Repor as 3 funções ao vivo que faziam o match por e-mail pra usar
--      a FK: calcular_producao_comercial_mes, gerar_comissoes_a_pagar
--      (ambas com base na migration 248 — a versão que corrigiu o crash
--      "record is not assigned yet" de piso/teto de faixa; NÃO a 240,
--      que já estava superada) e gerar_fluxo_financeiro_consorcio
--      (migration 269, não afetada pelo bug do 248). comissao_comercial_
--      calculada (240) e comissao_apurada_mes (294) não mudam — só
--      chamam calcular_producao_comercial_mes.
--
-- A escrita de funcionario_id daqui pra frente acontece via
-- /api/admin/usuarios (fluxo único de criação/edição de usuário +
-- vínculo com RH), não mais por coincidência de e-mail digitado em dois
-- formulários separados.

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS funcionario_id UUID REFERENCES rh_funcionarios(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS usuarios_funcionario_id_unico
  ON usuarios(funcionario_id)
  WHERE funcionario_id IS NOT NULL AND deleted_at IS NULL;

-- Backfill idempotente: só preenche onde ainda está NULL, nunca sobrescreve
-- um vínculo já estabelecido (manual ou de uma rodada anterior desta mesma
-- migration). Restrito a usuarios não-excluídos pra não colidir com o
-- índice único acima (um soft-deletado e um ativo com o mesmo e-mail não
-- podem apontar pro mesmo funcionário).
UPDATE usuarios u
SET funcionario_id = f.id
FROM rh_funcionarios f
WHERE u.funcionario_id IS NULL
  AND u.deleted_at IS NULL
  AND f.empresa_id = u.empresa_id
  AND lower(f.email) = lower(u.email)
  AND f.status = 'ativo';

-- ============================================================
-- 1. calcular_producao_comercial_mes — corpo idêntico à migration 248
--    (versão que já corrige o crash de piso/teto de faixa — NÃO a 240),
--    só o bloco de resolução do funcionário passa a usar a FK.
-- ============================================================
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
  v_piso                   NUMERIC := 0;
  v_teto                   NUMERIC := 0;
  v_valor                  NUMERIC := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM usuarios WHERE id = auth.uid() AND empresa_id = p_empresa_id AND ativo = true
  ) THEN
    RAISE EXCEPTION 'Acesso negado: empresa_id inválido para este usuário';
  END IF;

  SELECT
    COALESCE(SUM(p.valor_financiado * COALESCE(cp.comissao_comercial, 0) / 100)
             FILTER (WHERE p.modalidade NOT IN ('Contrato', 'Consorcio')), 0),
    COALESCE(SUM(p.valor_contrato) FILTER (WHERE p.modalidade = 'Contrato'), 0),
    COALESCE(SUM(p.valor_assessoria), 0)
  INTO v_producao_financiamento, v_producao_contrato, v_producao_assessoria
  FROM processos p
  LEFT JOIN LATERAL (
    SELECT x.comissao_comercial FROM comissoes_padrao x
    WHERE x.banco_id = p.banco_id AND x.empresa_id = p.empresa_id
      AND (x.modalidade = '' OR x.modalidade = p.modalidade::TEXT)
    ORDER BY (x.modalidade <> '') DESC
    LIMIT 1
  ) cp ON true
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
  FROM usuarios u2
  JOIN rh_funcionarios f ON f.id = u2.funcionario_id
  LEFT JOIN rh_cargos c ON c.id = f.cargo_id
  WHERE u2.id = p_comercial_usuario_id
    AND f.empresa_id = p_empresa_id
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
        v_pct  := COALESCE(v_faixa.pct_comercial, v_faixa.percentual, 0);
        v_piso := COALESCE(v_faixa.piso_valor, 0);
        v_teto := COALESCE(v_faixa.teto_valor, 0);
      END IF;
    END IF;
  END IF;

  v_valor := v_producao_total * v_pct / 100;

  IF v_piso > 0 THEN v_valor := GREATEST(v_valor, v_piso); END IF;
  IF v_teto > 0 THEN v_valor := LEAST(v_valor, v_teto); END IF;

  RETURN QUERY SELECT
    v_producao_total,
    v_pct,
    v_valor,
    v_regra_id,
    CASE WHEN v_func_found THEN v_func.func_id ELSE NULL END;
END;
$$;

GRANT EXECUTE ON FUNCTION calcular_producao_comercial_mes(UUID, UUID, INTEGER, INTEGER) TO authenticated;

-- ============================================================
-- 2. gerar_comissoes_a_pagar — corpo idêntico à migration 248 (versão
--    que já corrige o crash de piso/teto — NÃO a 240), só o bloco de
--    resolução do funcionário (dentro do LOOP por comercial) passa a
--    usar a FK.
-- ============================================================
CREATE OR REPLACE FUNCTION gerar_comissoes_a_pagar(
  p_fechamento_id UUID
)
RETURNS INTEGER AS $$
DECLARE
  v_fechamento     RECORD;
  v_proc           RECORD;
  v_com            RECORD;
  v_func           RECORD;
  v_faixa          RECORD;
  v_regra          RECORD;
  v_regra_id       UUID;
  v_pct            NUMERIC;
  v_piso           NUMERIC;
  v_teto           NUMERIC;
  v_valor          NUMERIC;
  v_producao_total NUMERIC;
  v_count          INTEGER := 0;
  v_func_found     BOOLEAN;
  v_faixa_found    BOOLEAN;
BEGIN
  SELECT f.*
  INTO v_fechamento
  FROM financeiro_fechamentos f
  JOIN usuarios u ON u.id = auth.uid()
  WHERE f.id = p_fechamento_id AND f.empresa_id = u.empresa_id AND u.ativo = true;

  IF NOT FOUND THEN RAISE EXCEPTION 'Fechamento não encontrado ou acesso negado'; END IF;
  IF v_fechamento.status = 'travado' THEN RAISE EXCEPTION 'Fechamento travado'; END IF;

  DELETE FROM financeiro_comissoes_pagar
  WHERE fechamento_id = p_fechamento_id AND ajuste_manual = 0;

  -- ============================================================
  -- COMERCIAL: agrega por comercial, ponderando financiamento pela taxa
  -- que o banco paga ao comercial antes de somar com contrato/assessoria.
  -- ============================================================
  FOR v_com IN
    SELECT
      fp.comercial_id,
      SUM(fp.valor_financiado * COALESCE(cp.comissao_comercial, 0) / 100)
        FILTER (WHERE fp.modalidade NOT IN ('Contrato'))                AS producao_financiamento,
      SUM(fp.valor_financiado) FILTER (WHERE fp.modalidade = 'Contrato') AS producao_contrato,
      SUM(fp.valor_assessoria)                                          AS producao_assessoria
    FROM financeiro_fechamento_processos fp
    LEFT JOIN LATERAL (
      SELECT x.comissao_comercial FROM comissoes_padrao x
      WHERE x.banco_id = fp.banco_id AND x.empresa_id = fp.empresa_id
        AND (x.modalidade = '' OR x.modalidade = fp.modalidade)
      ORDER BY (x.modalidade <> '') DESC
      LIMIT 1
    ) cp ON true
    WHERE fp.fechamento_id = p_fechamento_id
      AND fp.comercial_id IS NOT NULL
    GROUP BY fp.comercial_id
  LOOP
    v_producao_total := COALESCE(v_com.producao_financiamento, 0)
                       + COALESCE(v_com.producao_contrato, 0)
                       + COALESCE(v_com.producao_assessoria, 0);

    v_func_found  := false;
    v_faixa_found := false;
    v_regra_id    := NULL;
    v_pct         := 0;
    v_piso        := 0;
    v_teto        := 0;

    SELECT f.*, f.regra_comissao_id AS regra_funcionario, c.regra_comissao_id AS regra_cargo
    INTO v_func
    FROM usuarios u2
    JOIN rh_funcionarios f ON f.id = u2.funcionario_id
    LEFT JOIN rh_cargos c ON c.id = f.cargo_id
    WHERE u2.id = v_com.comercial_id
      AND f.empresa_id = v_fechamento.empresa_id
      AND f.status = 'ativo'
    LIMIT 1;

    v_func_found := FOUND;

    IF v_func_found THEN
      v_regra_id := COALESCE(v_func.regra_funcionario, v_func.regra_cargo);
    END IF;

    IF v_regra_id IS NOT NULL THEN
      SELECT * INTO v_regra FROM rh_regras_comissao WHERE id = v_regra_id;

      IF FOUND AND v_regra.tipo_calculo = 'percentual_faixa_producao_mensal' THEN
        SELECT *
        INTO v_faixa
        FROM rh_faixas_comissao
        WHERE regra_id = v_regra_id
          AND valor_minimo <= v_producao_total
          AND (valor_maximo = 0 OR valor_maximo >= v_producao_total)
        ORDER BY valor_minimo DESC
        LIMIT 1;

        v_faixa_found := FOUND;

        IF v_faixa_found THEN
          v_pct  := COALESCE(v_faixa.pct_comercial, v_faixa.percentual, 0);
          v_piso := COALESCE(v_faixa.piso_valor, 0);
          v_teto := COALESCE(v_faixa.teto_valor, 0);
        END IF;
      END IF;
    END IF;

    v_valor := v_producao_total * v_pct / 100;

    IF v_piso > 0 THEN v_valor := GREATEST(v_valor, v_piso); END IF;
    IF v_teto > 0 THEN v_valor := LEAST(v_valor, v_teto); END IF;

    IF v_valor > 0 THEN
      INSERT INTO financeiro_comissoes_pagar (
        empresa_id, fechamento_id, processo_id,
        usuario_id, funcionario_id, tipo_destinatario, papel, regra_id,
        valor_base, percentual, valor_calculado, status
      ) VALUES (
        v_fechamento.empresa_id, p_fechamento_id, NULL,
        v_com.comercial_id,
        CASE WHEN v_func_found THEN v_func.id ELSE NULL END,
        CASE WHEN v_func_found THEN 'funcionario' ELSE 'usuario' END,
        'comercial', v_regra_id,
        v_producao_total, v_pct, v_valor, 'calculada'
      );
      v_count := v_count + 1;
    END IF;

    IF NOT v_func_found THEN
      INSERT INTO financeiro_conferencias (
        empresa_id, fechamento_id, tipo, severidade, status, titulo, descricao,
        entidade_tipo, entidade_id
      ) VALUES (
        v_fechamento.empresa_id, p_fechamento_id, 'comissao_sem_funcionario', 'alerta', 'pendente',
        'Comercial não encontrado no RH',
        'O usuário comercial não possui cadastro ativo no módulo RH para aplicação de regra.',
        'financeiro_fechamento_processos', NULL
      ) ON CONFLICT DO NOTHING;
    END IF;

    IF v_func_found AND v_regra_id IS NULL THEN
      INSERT INTO financeiro_conferencias (
        empresa_id, fechamento_id, tipo, severidade, status, titulo, descricao,
        entidade_tipo, entidade_id
      ) VALUES (
        v_fechamento.empresa_id, p_fechamento_id, 'processo_sem_regra_comissao', 'alerta', 'pendente',
        'Sem regra de comissão',
        'Nem o funcionário nem o cargo do comercial têm regra de comissão configurada.',
        'financeiro_fechamento_processos', NULL
      ) ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  -- ============================================================
  -- OPERACIONAL + PARCEIRO: continuam por processo (inalterado).
  -- ============================================================
  FOR v_proc IN
    SELECT fp.*, p.parceiro_id,
           cp.comissao_operacional, cp.comissao_parceiro
    FROM financeiro_fechamento_processos fp
    LEFT JOIN processos p ON p.id = fp.processo_id
    LEFT JOIN comissoes_padrao cp
      ON cp.banco_id = fp.banco_id
     AND cp.empresa_id = fp.empresa_id
     AND (cp.modalidade = '' OR cp.modalidade = fp.modalidade)
    WHERE fp.fechamento_id = p_fechamento_id
      AND fp.modalidade <> 'Contrato'
  LOOP
    IF v_proc.operacional_id IS NOT NULL AND COALESCE(v_proc.comissao_operacional, 0) > 0 THEN
      v_valor := COALESCE(v_proc.valor_financiado, 0) * COALESCE(v_proc.comissao_operacional, 0) / 100;

      IF v_valor > 0 THEN
        INSERT INTO financeiro_comissoes_pagar (
          empresa_id, fechamento_id, processo_id,
          usuario_id, tipo_destinatario, papel,
          valor_base, percentual, valor_calculado, status
        ) VALUES (
          v_fechamento.empresa_id, p_fechamento_id, v_proc.processo_id,
          v_proc.operacional_id, 'usuario', 'operacional',
          COALESCE(v_proc.valor_financiado, 0), COALESCE(v_proc.comissao_operacional, 0),
          v_valor, 'calculada'
        );
        v_count := v_count + 1;
      END IF;
    END IF;

    IF COALESCE(v_proc.comissao_parceiro, 0) > 0 THEN
      v_valor := COALESCE(v_proc.valor_financiado, 0) * COALESCE(v_proc.comissao_parceiro, 0) / 100;

      IF v_valor > 0 THEN
        INSERT INTO financeiro_comissoes_pagar (
          empresa_id, fechamento_id, processo_id,
          tipo_destinatario, papel, parceiro_id,
          valor_base, percentual, valor_calculado, status
        ) VALUES (
          v_fechamento.empresa_id, p_fechamento_id, v_proc.processo_id,
          'externo', 'parceiro', v_proc.parceiro_id,
          COALESCE(v_proc.valor_financiado, 0),
          COALESCE(v_proc.comissao_parceiro, 0),
          v_valor, 'calculada'
        );
        v_count := v_count + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 3. gerar_fluxo_financeiro_consorcio — corpo idêntico à migration 269,
--    só o bloco de resolução do funcionário passa a usar a FK.
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
      FROM usuarios u2
      JOIN rh_funcionarios f ON f.id = u2.funcionario_id
      LEFT JOIN rh_cargos c ON c.id = f.cargo_id
      WHERE u2.id = v_processo.comercial_id
        AND f.empresa_id = v_processo.empresa_id
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
