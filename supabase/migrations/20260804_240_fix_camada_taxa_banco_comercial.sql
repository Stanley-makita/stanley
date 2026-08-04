-- Migration 240: Corrige a base de cálculo da comissão comercial —
-- faltava a camada da taxa que cada banco paga ao comercial.
--
-- Modelo correto (confirmado com o usuário, ver planilha "Análise
-- Comercial" — coluna "Comissão" = valor financiado × "checagem"):
--   1. Por processo de Financiamento: comissão-base = valor_financiado ×
--      taxa que o banco paga ao comercial (comissoes_padrao.comissao_comercial,
--      varia por banco/modalidade). Contrato e Assessoria entram pelo valor
--      bruto (sem taxa de banco).
--   2. Produção do mês do comercial = soma das comissões-base (não do valor
--      financiado bruto) — é sobre essa soma que a faixa do RH é aplicada.
--
-- As funções abaixo somavam valor_financiado bruto, pulando o passo 1
-- inteiro (resultado: comissão calculada muito acima do esperado).
--
-- Não muda: comissao_empresa_calculada (não usa faixa do RH, já está
-- correta) e calcular_painel_financeiro (KPI de volume bruto de produção,
-- métrica diferente, não é comissão).

-- ============================================================
-- 1. calcular_producao_comercial_mes — pondera financiamento pela taxa do
--    banco antes de somar com contrato/assessoria.
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
  FROM rh_funcionarios f
  LEFT JOIN rh_cargos c ON c.id = f.cargo_id
  WHERE f.empresa_id = p_empresa_id
    AND f.email = (SELECT email FROM usuarios WHERE id = p_comercial_usuario_id)
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
        v_pct := COALESCE(v_faixa.pct_comercial, v_faixa.percentual, 0);
      END IF;
    END IF;
  END IF;

  v_valor := v_producao_total * v_pct / 100;

  IF v_faixa_found AND v_faixa.piso_valor > 0 THEN
    v_valor := GREATEST(v_valor, v_faixa.piso_valor);
  END IF;
  IF v_faixa_found AND v_faixa.teto_valor > 0 THEN
    v_valor := LEAST(v_valor, v_faixa.teto_valor);
  END IF;

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
-- 2. comissao_comercial_calculada(processos) — contribuição do processo
--    de Financiamento agora é ponderada pela taxa do banco daquele
--    processo específico, não o valor bruto.
-- ============================================================
CREATE OR REPLACE FUNCTION comissao_comercial_calculada(processos)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_contribuicao NUMERIC;
  v_taxa_banco   NUMERIC;
  v_prod         RECORD;
BEGIN
  IF $1.status_emissao IS DISTINCT FROM 'emitido'
     OR $1.comercial_id IS NULL
     OR $1.modalidade = 'Consorcio'
     OR $1.data_emissao IS NULL THEN
    RETURN NULL;
  END IF;

  IF $1.modalidade = 'Contrato' THEN
    v_contribuicao := COALESCE($1.valor_contrato, 0) + COALESCE($1.valor_assessoria, 0);
  ELSE
    SELECT x.comissao_comercial
    INTO v_taxa_banco
    FROM comissoes_padrao x
    WHERE x.banco_id = $1.banco_id AND x.empresa_id = $1.empresa_id
      AND (x.modalidade = '' OR x.modalidade = $1.modalidade::TEXT)
    ORDER BY (x.modalidade <> '') DESC
    LIMIT 1;

    v_contribuicao := COALESCE($1.valor_financiado, 0) * COALESCE(v_taxa_banco, 0) / 100
                     + COALESCE($1.valor_assessoria, 0);
  END IF;

  SELECT * INTO v_prod
  FROM calcular_producao_comercial_mes(
    $1.empresa_id, $1.comercial_id,
    EXTRACT(MONTH FROM $1.data_emissao)::INTEGER,
    EXTRACT(YEAR  FROM $1.data_emissao)::INTEGER
  );

  IF v_prod.producao_total IS NULL OR v_prod.producao_total = 0 THEN
    RETURN 0;
  END IF;

  RETURN ROUND(v_prod.comissao_total * v_contribuicao / v_prod.producao_total, 2);
END;
$$;

-- ============================================================
-- 3. gerar_comissoes_a_pagar — mesma ponderação no bloco COMERCIAL
--    (agrega a partir do snapshot financeiro_fechamento_processos, usado
--    de verdade quando o Fechamento é aprovado).
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

    SELECT f.*, f.regra_comissao_id AS regra_funcionario, c.regra_comissao_id AS regra_cargo
    INTO v_func
    FROM rh_funcionarios f
    LEFT JOIN rh_cargos c ON c.id = f.cargo_id
    WHERE f.empresa_id = v_fechamento.empresa_id
      AND f.email = (SELECT email FROM usuarios WHERE id = v_com.comercial_id)
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
          v_pct := COALESCE(v_faixa.pct_comercial, v_faixa.percentual, 0);
        END IF;
      END IF;
    END IF;

    v_valor := v_producao_total * v_pct / 100;

    IF v_faixa_found AND v_faixa.piso_valor > 0 THEN
      v_valor := GREATEST(v_valor, v_faixa.piso_valor);
    END IF;
    IF v_faixa_found AND v_faixa.teto_valor > 0 THEN
      v_valor := LEAST(v_valor, v_faixa.teto_valor);
    END IF;

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
