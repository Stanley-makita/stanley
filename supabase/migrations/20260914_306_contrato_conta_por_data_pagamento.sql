-- Reportado: Luciana Fontinhas tem um Contrato (#proc-059, R$15.000) com
-- pagamento confirmado em 11/09/2026 — aparece certo na sub-aba
-- "Contratos" de Análise de Comissões, mas não soma em "Comissão
-- Apurada" pro mesmo mês.
--
-- Causa: a sub-aba "Contratos" (analise_comissoes_contratos_mes,
-- migration 293) foi desenhada de propósito pra contar o contrato pelo
-- mês em que o PAGAMENTO foi confirmado (data_pagamento_contrato), não
-- pela emissão — ver docs/superpowers/specs/2026-09-11-aba-contratos-
-- analise-comissoes-design.md: "O gatilho de qual mês um contrato
-- aparece é a data em que o pagamento foi confirmado, não a data de
-- criação/emissão." Só que calcular_producao_comercial_mes,
-- comissao_apurada_mes e puxar_contratos nunca foram atualizadas pra
-- esse critério — continuam exigindo status_emissao='emitido' +
-- data_emissao no mês, que é o critério de Financiamento, não de
-- Contrato. Resultado: um contrato como o da Luciana (nao_emitido,
-- data_emissao NULL, mas pago em setembro) nunca entra no subtotal do
-- comercial nem seria puxado pra um fechamento real.
--
-- Fix: nas 3 funções, a condição de "este processo conta neste mês"
-- passa a ser por modalidade — Contrato usa data_pagamento_contrato,
-- as demais continuam com status_emissao='emitido' + data_emissao
-- (inalterado). Consórcio continua de fora (motor próprio).

-- ============================================================
-- 1. calcular_producao_comercial_mes
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
  funcionario_id UUID,
  comissao_faixa NUMERIC,
  cgi_valor_limite NUMERIC,
  cgi_percentual_acima NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_producao_financiamento NUMERIC;
  v_producao_contrato      NUMERIC;
  v_producao_assessoria    NUMERIC;
  v_producao_cgi_especial  NUMERIC;
  v_valor_financiado_bruto NUMERIC;
  v_producao_total         NUMERIC;
  v_func                   RECORD;
  v_func_found             BOOLEAN;
  v_regra_id               UUID;
  v_regra                  RECORD;
  v_tipo_calculo           TEXT;
  v_cgi_valor_limite       NUMERIC;
  v_cgi_percentual_acima   NUMERIC;
  v_faixa                  RECORD;
  v_faixa_found            BOOLEAN;
  v_pct                    NUMERIC := 0;
  v_piso                   NUMERIC := 0;
  v_teto                   NUMERIC := 0;
  v_valor_faixa            NUMERIC := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM usuarios WHERE id = auth.uid() AND empresa_id = p_empresa_id AND ativo = true
  ) THEN
    RAISE EXCEPTION 'Acesso negado: empresa_id inválido para este usuário';
  END IF;

  v_func_found  := false;
  v_regra_id    := NULL;
  v_faixa_found := false;
  v_tipo_calculo         := NULL;
  v_cgi_valor_limite     := NULL;
  v_cgi_percentual_acima := NULL;

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
    SELECT r.tipo_calculo, r.cgi_valor_limite, r.cgi_percentual_acima
    INTO v_regra
    FROM rh_regras_comissao r WHERE r.id = v_regra_id;

    IF FOUND THEN
      v_tipo_calculo         := v_regra.tipo_calculo;
      v_cgi_valor_limite     := v_regra.cgi_valor_limite;
      v_cgi_percentual_acima := v_regra.cgi_percentual_acima;
    END IF;
  END IF;

  SELECT
    COALESCE(SUM(
      CASE
        WHEN COALESCE(cp.valor_maximo_comissao, 0) > 0
          THEN LEAST(p.valor_financiado * COALESCE(cp.comissao_comercial, 0) / 100, cp.valor_maximo_comissao)
        ELSE p.valor_financiado * COALESCE(cp.comissao_comercial, 0) / 100
      END
    ) FILTER (
      WHERE p.modalidade NOT IN ('Contrato', 'Consorcio')
        AND NOT (
          p.modalidade = 'CGI' AND v_cgi_valor_limite IS NOT NULL
          AND p.valor_financiado > v_cgi_valor_limite
        )
    ), 0),
    COALESCE(SUM(p.valor_contrato) FILTER (WHERE p.modalidade = 'Contrato'), 0),
    COALESCE(SUM(p.valor_assessoria), 0),
    COALESCE(SUM(p.valor_financiado * v_cgi_percentual_acima / 100)
             FILTER (
               WHERE p.modalidade = 'CGI' AND v_cgi_valor_limite IS NOT NULL
                 AND p.valor_financiado > v_cgi_valor_limite
             ), 0),
    COALESCE(SUM(p.valor_financiado)
             FILTER (
               WHERE p.modalidade NOT IN ('Contrato', 'Consorcio')
                 AND NOT (
                   p.modalidade = 'CGI' AND v_cgi_valor_limite IS NOT NULL
                   AND p.valor_financiado > v_cgi_valor_limite
                 )
             ), 0)
  INTO v_producao_financiamento, v_producao_contrato, v_producao_assessoria, v_producao_cgi_especial, v_valor_financiado_bruto
  FROM processos p
  LEFT JOIN LATERAL (
    SELECT x.comissao_comercial, x.valor_maximo_comissao FROM comissoes_padrao x
    WHERE x.banco_id = p.banco_id AND x.empresa_id = p.empresa_id
      AND (x.modalidade = '' OR x.modalidade = p.modalidade::TEXT)
      AND COALESCE(p.valor_financiado, 0) >= x.piso_valor
      AND (x.teto_valor = 0 OR COALESCE(p.valor_financiado, 0) <= x.teto_valor)
    ORDER BY (x.modalidade <> '') DESC, x.piso_valor DESC
    LIMIT 1
  ) cp ON true
  WHERE p.empresa_id = p_empresa_id
    AND p.comercial_id = p_comercial_usuario_id
    AND p.modalidade <> 'Consorcio'
    AND (
      (p.modalidade = 'Contrato'
        AND p.data_pagamento_contrato IS NOT NULL
        AND EXTRACT(MONTH FROM p.data_pagamento_contrato) = p_mes
        AND EXTRACT(YEAR  FROM p.data_pagamento_contrato) = p_ano)
      OR
      (p.modalidade <> 'Contrato'
        AND p.status_emissao = 'emitido'
        AND p.data_emissao IS NOT NULL
        AND EXTRACT(MONTH FROM p.data_emissao) = p_mes
        AND EXTRACT(YEAR  FROM p.data_emissao) = p_ano)
    );

  v_producao_total := v_producao_financiamento + v_producao_contrato + v_producao_assessoria;

  IF v_tipo_calculo = 'percentual_faixa_producao_mensal' THEN
    SELECT *
    INTO v_faixa
    FROM rh_faixas_comissao fx
    WHERE fx.regra_id = v_regra_id
      AND fx.valor_minimo <= v_valor_financiado_bruto
      AND (fx.valor_maximo = 0 OR fx.valor_maximo >= v_valor_financiado_bruto)
    ORDER BY fx.valor_minimo DESC
    LIMIT 1;

    v_faixa_found := FOUND;
    IF v_faixa_found THEN
      v_pct  := COALESCE(v_faixa.pct_comercial, v_faixa.percentual, 0);
      v_piso := COALESCE(v_faixa.piso_valor, 0);
      v_teto := COALESCE(v_faixa.teto_valor, 0);
    END IF;
  END IF;

  v_valor_faixa := v_producao_total * v_pct / 100;

  IF v_piso > 0 THEN v_valor_faixa := GREATEST(v_valor_faixa, v_piso); END IF;
  IF v_teto > 0 THEN v_valor_faixa := LEAST(v_valor_faixa, v_teto); END IF;

  RETURN QUERY SELECT
    v_producao_total,
    v_pct,
    v_valor_faixa + v_producao_cgi_especial,
    v_regra_id,
    CASE WHEN v_func_found THEN v_func.func_id ELSE NULL END,
    v_valor_faixa,
    v_cgi_valor_limite,
    v_cgi_percentual_acima;
END;
$$;

GRANT EXECUTE ON FUNCTION calcular_producao_comercial_mes(UUID, UUID, INTEGER, INTEGER) TO authenticated;

-- ============================================================
-- 2. comissao_apurada_mes — mesmo ajuste no WHERE do recálculo local
--    (contagem/valor de contratos e o card "Comissão" de financiamento).
-- ============================================================
CREATE OR REPLACE FUNCTION comissao_apurada_mes(
  p_empresa_id            UUID,
  p_comercial_usuario_id  UUID,
  p_mes                   INTEGER,
  p_ano                   INTEGER
)
RETURNS TABLE (
  qtd_processos_financiamento INTEGER,
  qtd_contratos                INTEGER,
  valor_financiamento          NUMERIC,
  comissao_financiamento       NUMERIC,
  valor_assessoria             NUMERIC,
  valor_contratos               NUMERIC,
  subtotal                     NUMERIC,
  pct_aplicado                 NUMERIC,
  comissao_calculada           NUMERIC,
  cgi_1_total                  NUMERIC,
  comissao_apurada             NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_qtd_financiamento      INTEGER;
  v_qtd_contratos          INTEGER;
  v_valor_financiamento    NUMERIC;
  v_comissao_financiamento NUMERIC;
  v_valor_assessoria       NUMERIC;
  v_valor_contratos        NUMERIC;
  v_producao               RECORD;
  v_cgi_1_total            NUMERIC;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.empresa_id = p_empresa_id AND u.ativo = true
  ) THEN
    RAISE EXCEPTION 'Acesso negado: empresa_id inválido para este usuário';
  END IF;

  SELECT * INTO v_producao
  FROM calcular_producao_comercial_mes(p_empresa_id, p_comercial_usuario_id, p_mes, p_ano);

  v_cgi_1_total := v_producao.comissao_total - v_producao.comissao_faixa;

  SELECT
    COUNT(*) FILTER (
      WHERE p.modalidade NOT IN ('Contrato', 'Consorcio')
        AND NOT (
          p.modalidade = 'CGI' AND v_producao.cgi_valor_limite IS NOT NULL
          AND p.valor_financiado > v_producao.cgi_valor_limite
        )
    ),
    COUNT(*) FILTER (WHERE p.modalidade = 'Contrato'),
    COALESCE(SUM(p.valor_financiado) FILTER (
      WHERE p.modalidade NOT IN ('Contrato', 'Consorcio')
        AND NOT (
          p.modalidade = 'CGI' AND v_producao.cgi_valor_limite IS NOT NULL
          AND p.valor_financiado > v_producao.cgi_valor_limite
        )
    ), 0),
    COALESCE(SUM(
      CASE
        WHEN COALESCE(cp.valor_maximo_comissao, 0) > 0
          THEN LEAST(p.valor_financiado * COALESCE(cp.comissao_comercial, 0) / 100, cp.valor_maximo_comissao)
        ELSE p.valor_financiado * COALESCE(cp.comissao_comercial, 0) / 100
      END
    ) FILTER (
      WHERE p.modalidade NOT IN ('Contrato', 'Consorcio')
        AND NOT (
          p.modalidade = 'CGI' AND v_producao.cgi_valor_limite IS NOT NULL
          AND p.valor_financiado > v_producao.cgi_valor_limite
        )
    ), 0),
    COALESCE(SUM(p.valor_assessoria), 0),
    COALESCE(SUM(p.valor_contrato) FILTER (WHERE p.modalidade = 'Contrato'), 0)
  INTO
    v_qtd_financiamento,
    v_qtd_contratos,
    v_valor_financiamento,
    v_comissao_financiamento,
    v_valor_assessoria,
    v_valor_contratos
  FROM processos p
  LEFT JOIN LATERAL (
    SELECT x.comissao_comercial, x.valor_maximo_comissao FROM comissoes_padrao x
    WHERE x.banco_id = p.banco_id AND x.empresa_id = p.empresa_id
      AND (x.modalidade = '' OR x.modalidade = p.modalidade::TEXT)
      AND COALESCE(p.valor_financiado, 0) >= x.piso_valor
      AND (x.teto_valor = 0 OR COALESCE(p.valor_financiado, 0) <= x.teto_valor)
    ORDER BY (x.modalidade <> '') DESC, x.piso_valor DESC
    LIMIT 1
  ) cp ON true
  WHERE p.empresa_id = p_empresa_id
    AND p.comercial_id = p_comercial_usuario_id
    AND p.modalidade <> 'Consorcio'
    AND (
      (p.modalidade = 'Contrato'
        AND p.data_pagamento_contrato IS NOT NULL
        AND EXTRACT(MONTH FROM p.data_pagamento_contrato) = p_mes
        AND EXTRACT(YEAR  FROM p.data_pagamento_contrato) = p_ano)
      OR
      (p.modalidade <> 'Contrato'
        AND p.status_emissao = 'emitido'
        AND p.data_emissao IS NOT NULL
        AND EXTRACT(MONTH FROM p.data_emissao) = p_mes
        AND EXTRACT(YEAR  FROM p.data_emissao) = p_ano)
    );

  RETURN QUERY SELECT
    v_qtd_financiamento,
    v_qtd_contratos,
    v_valor_financiamento,
    v_comissao_financiamento,
    v_valor_assessoria,
    v_valor_contratos,
    v_producao.producao_total,
    v_producao.pct_aplicado,
    v_producao.comissao_faixa,
    v_cgi_1_total,
    v_producao.comissao_total;
END;
$$;

GRANT EXECUTE ON FUNCTION comissao_apurada_mes(UUID, UUID, INTEGER, INTEGER) TO authenticated;

-- ============================================================
-- 3. puxar_contratos — passa a puxar pelo mês de data_pagamento_contrato,
--    sem exigir status_emissao='emitido' (contratos não têm esse
--    conceito de forma significativa; o "confirmado" deles é o
--    pagamento). Mesmo padrão de filtro de analise_comissoes_contratos_mes.
-- ============================================================
CREATE OR REPLACE FUNCTION puxar_contratos(
  p_fechamento_id UUID
)
RETURNS INTEGER AS $$
DECLARE
  v_fechamento  RECORD;
  v_proc        RECORD;
  v_count       INTEGER := 0;
  v_valor       NUMERIC;
  v_fp_id       UUID;
BEGIN
  SELECT f.*, u.empresa_id AS user_empresa
  INTO v_fechamento
  FROM financeiro_fechamentos f
  JOIN usuarios u ON u.id = auth.uid()
  WHERE f.id = p_fechamento_id AND f.empresa_id = u.empresa_id AND u.ativo = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fechamento não encontrado ou acesso negado';
  END IF;

  IF v_fechamento.status = 'travado' THEN
    RAISE EXCEPTION 'Fechamento travado. Reabra antes de importar contratos.';
  END IF;

  FOR v_proc IN
    SELECT
      p.id,
      p.numero_processo,
      p.comercial_id,
      p.juridico_id,
      p.valor_contrato,
      p.data_pagamento_contrato,
      p.status_emissao,
      p.modalidade,
      COALESCE(pc.nome, pe.nome, '') AS cliente_nome
    FROM processos p
    LEFT JOIN pessoas pe ON pe.id = p.pessoa_id
    LEFT JOIN LATERAL (
      SELECT nome FROM processo_compradores
      WHERE processo_id = p.id
      ORDER BY principal DESC NULLS LAST, created_at ASC
      LIMIT 1
    ) pc ON true
    WHERE p.empresa_id = v_fechamento.empresa_id
      AND p.modalidade = 'Contrato'
      AND p.data_pagamento_contrato IS NOT NULL
      AND EXTRACT(MONTH FROM p.data_pagamento_contrato) = v_fechamento.competencia_mes
      AND EXTRACT(YEAR  FROM p.data_pagamento_contrato) = v_fechamento.competencia_ano
      AND NOT EXISTS (
        SELECT 1 FROM financeiro_fechamento_processos fp
        WHERE fp.processo_id = p.id AND fp.fechamento_id = p_fechamento_id
      )
  LOOP
    v_valor := COALESCE(v_proc.valor_contrato, 0);

    INSERT INTO financeiro_fechamento_processos (
      fechamento_id, empresa_id, processo_id, cliente_nome, banco_id, modalidade,
      valor_financiado, data_emissao, comercial_id, operacional_id, status_origem
    ) VALUES (
      p_fechamento_id, v_fechamento.empresa_id, v_proc.id, v_proc.cliente_nome,
      NULL, 'Contrato', v_valor, v_proc.data_pagamento_contrato,
      v_proc.comercial_id, v_proc.juridico_id, v_proc.status_emissao
    )
    RETURNING id INTO v_fp_id;

    INSERT INTO financeiro_contas_receber (
      empresa_id, fechamento_id, processo_id, banco_id, cliente_nome, origem,
      valor_base, percentual_previsto, valor_previsto, status
    ) VALUES (
      v_fechamento.empresa_id, p_fechamento_id, v_proc.id, NULL, v_proc.cliente_nome,
      'contrato', v_valor, 0, v_valor,
      'a_faturar'
    );

    IF v_proc.comercial_id IS NULL THEN
      INSERT INTO financeiro_conferencias (
        empresa_id, fechamento_id, tipo, severidade, status, titulo, descricao,
        entidade_tipo, entidade_id
      ) VALUES (
        v_fechamento.empresa_id, p_fechamento_id, 'processo_sem_comercial', 'alerta', 'pendente',
        'Contrato sem comercial', 'O contrato não possui comercial vinculado.',
        'financeiro_fechamento_processos', v_fp_id
      ) ON CONFLICT DO NOTHING;
    END IF;

    IF v_valor = 0 THEN
      INSERT INTO financeiro_conferencias (
        empresa_id, fechamento_id, tipo, severidade, status, titulo, descricao,
        entidade_tipo, entidade_id
      ) VALUES (
        v_fechamento.empresa_id, p_fechamento_id, 'valor_negativo', 'critico', 'pendente',
        'Contrato sem valor', 'O campo valor_contrato está vazio ou zero. Verifique o processo.',
        'financeiro_fechamento_processos', v_fp_id
      ) ON CONFLICT DO NOTHING;
    END IF;

    v_count := v_count + 1;
  END LOOP;

  UPDATE financeiro_fechamentos
  SET status = 'em_conferencia', updated_at = now()
  WHERE id = p_fechamento_id AND status = 'rascunho';

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
