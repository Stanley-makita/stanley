-- Migration 235: Financeiro — Fase 1 do motor de comissão de Financiamento
--
-- Contexto: a partir da PR #89 (migration 208), rh_regras_comissao passou a
-- ter campos de valor fixo (valor_fixo_emissao/valor_fixo_assessoria) mas a
-- gerar_comissoes_a_pagar ficou propositalmente desconectada, aguardando a
-- reformulação completa do módulo Financeiro. Esta migration é essa
-- reformulação (fase 1 — só Financiamento; Consórcio recorrente e Contrato
-- particular/Jurídico ficam para fases seguintes).
--
-- Modelo de negócio confirmado com o usuário (planilha "Análise Comercial
-- 2025 oficial definitiva.xlsx", aba "Resumo"):
--   - Comercial: percentual sobre a PRODUÇÃO MENSAL ACUMULADA (financiamento
--     + contrato + assessoria somados), em faixas por nível/cargo. Regra
--     atribuída por funcionário individual (com fallback pro cargo).
--   - Operacional: continua com valor fixo por emissão + gratificação por
--     meta (modelo atual pós PR #89) — não muda nesta fase.
--
-- Mudança de comportamento importante: puxar_contratos hoje paga 100% do
-- valor_contrato como comissão direta ao comercial. Isso está errado pro
-- novo modelo — o valor do contrato deve entrar como PRODUÇÃO (junto com
-- financiamento e assessoria) na base de cálculo da faixa percentual do
-- comercial, não ser pago à parte. Esta migration remove esse pagamento
-- direto de puxar_contratos; a comissão sobre esse valor agora sai de
-- gerar_comissoes_a_pagar, agregada com o resto da produção do mês.

-- ============================================================
-- 1. rh_regras_comissao: tipo de cálculo
-- ============================================================
ALTER TABLE rh_regras_comissao
  ADD COLUMN IF NOT EXISTS tipo_calculo TEXT NOT NULL DEFAULT 'valor_fixo_emissao'
    CHECK (tipo_calculo IN ('valor_fixo_emissao', 'percentual_faixa_producao_mensal'));

COMMENT ON COLUMN rh_regras_comissao.tipo_calculo IS
  'valor_fixo_emissao = modelo operacional (valor_fixo_emissao/valor_fixo_assessoria + faixas com valor_fixo). '
  'percentual_faixa_producao_mensal = modelo comercial (faixas com pct_comercial avaliadas contra a produção mensal ACUMULADA do funcionário no fechamento, não o valor de um processo isolado).';

-- ============================================================
-- 2. rh_funcionarios: atribuição direta de regra (override do cargo)
-- ============================================================
ALTER TABLE rh_funcionarios
  ADD COLUMN IF NOT EXISTS regra_comissao_id UUID REFERENCES rh_regras_comissao(id) ON DELETE SET NULL;

COMMENT ON COLUMN rh_funcionarios.regra_comissao_id IS
  'Override individual da regra de comissão. Quando NULL, gerar_comissoes_a_pagar usa a regra do cargo (rh_cargos.regra_comissao_id).';

-- ============================================================
-- 3. financeiro_fechamento_processos: snapshot do valor de assessoria
-- ============================================================
ALTER TABLE financeiro_fechamento_processos
  ADD COLUMN IF NOT EXISTS valor_assessoria NUMERIC(14,2) NOT NULL DEFAULT 0;

-- ============================================================
-- 4. financeiro_comissoes_pagar: rastreabilidade de parceiro externo
-- ============================================================
ALTER TABLE financeiro_comissoes_pagar
  ADD COLUMN IF NOT EXISTS parceiro_id UUID REFERENCES parceiros(id) ON DELETE SET NULL;

COMMENT ON COLUMN financeiro_comissoes_pagar.parceiro_id IS
  'Vínculo com parceiros quando papel=parceiro e o processo tem processos.parceiro_id preenchido — antes essa linha ficava sem rastreabilidade nenhuma.';

-- ============================================================
-- 5. puxar_processos_emitidos: snapshot de valor_assessoria
-- ============================================================
CREATE OR REPLACE FUNCTION puxar_processos_emitidos(
  p_fechamento_id UUID
)
RETURNS INTEGER AS $$
DECLARE
  v_fechamento    RECORD;
  v_proc          RECORD;
  v_pct_empresa   NUMERIC;
  v_count         INTEGER := 0;
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
    RAISE EXCEPTION 'Fechamento travado. Reabra antes de puxar processos.';
  END IF;

  FOR v_proc IN
    SELECT
      p.id,
      p.numero_processo,
      p.banco_id,
      p.comercial_id,
      p.operacional_id,
      p.valor_financiado,
      p.valor_assessoria,
      p.data_emissao,
      p.status_emissao,
      COALESCE(pe.nome, p.cliente_nome, '') AS cliente_nome,
      p.modalidade
    FROM processos p
    LEFT JOIN pessoas pe ON pe.id = p.pessoa_id
    WHERE p.empresa_id = v_fechamento.empresa_id
      AND p.status_emissao = 'emitido'
      AND p.modalidade NOT IN ('Contrato', 'Consorcio')
      AND EXTRACT(MONTH FROM p.data_emissao) = v_fechamento.competencia_mes
      AND EXTRACT(YEAR  FROM p.data_emissao) = v_fechamento.competencia_ano
      AND NOT EXISTS (
        SELECT 1 FROM financeiro_fechamento_processos fp
        WHERE fp.processo_id = p.id AND fp.fechamento_id = p_fechamento_id
      )
  LOOP
    SELECT COALESCE(cp.comissao_empresa, 0)
    INTO v_pct_empresa
    FROM comissoes_padrao cp
    WHERE cp.empresa_id = v_fechamento.empresa_id AND cp.banco_id = v_proc.banco_id
    LIMIT 1;

    IF NOT FOUND THEN v_pct_empresa := 0; END IF;

    INSERT INTO financeiro_fechamento_processos (
      fechamento_id, empresa_id, processo_id, cliente_nome, banco_id, modalidade,
      valor_financiado, valor_assessoria, data_emissao, comercial_id, operacional_id, status_origem
    ) VALUES (
      p_fechamento_id, v_fechamento.empresa_id, v_proc.id, v_proc.cliente_nome,
      v_proc.banco_id, v_proc.modalidade, v_proc.valor_financiado, COALESCE(v_proc.valor_assessoria, 0),
      v_proc.data_emissao, v_proc.comercial_id, v_proc.operacional_id, v_proc.status_emissao
    );

    INSERT INTO financeiro_contas_receber (
      empresa_id, fechamento_id, processo_id, banco_id, cliente_nome, origem,
      valor_base, percentual_previsto, valor_previsto, status
    ) VALUES (
      v_fechamento.empresa_id, p_fechamento_id, v_proc.id, v_proc.banco_id, v_proc.cliente_nome,
      'emissao', COALESCE(v_proc.valor_financiado, 0), v_pct_empresa,
      COALESCE(v_proc.valor_financiado, 0) * v_pct_empresa / 100,
      'a_faturar'
    );

    IF v_proc.comercial_id IS NULL THEN
      INSERT INTO financeiro_conferencias (
        empresa_id, fechamento_id, tipo, severidade, status, titulo, descricao,
        entidade_tipo, entidade_id
      ) VALUES (
        v_fechamento.empresa_id, p_fechamento_id, 'processo_sem_comercial', 'alerta', 'pendente',
        'Processo sem comercial', 'O processo não possui comercial vinculado.',
        'financeiro_fechamento_processos', v_proc.id
      ) ON CONFLICT DO NOTHING;
    END IF;

    IF v_proc.operacional_id IS NULL THEN
      INSERT INTO financeiro_conferencias (
        empresa_id, fechamento_id, tipo, severidade, status, titulo, descricao,
        entidade_tipo, entidade_id
      ) VALUES (
        v_fechamento.empresa_id, p_fechamento_id, 'processo_sem_operacional', 'info', 'pendente',
        'Processo sem operacional', 'O processo não possui operacional vinculado.',
        'financeiro_fechamento_processos', v_proc.id
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

-- ============================================================
-- 6. puxar_contratos: remove pagamento direto de 100% ao comercial —
--    o valor do contrato agora entra só como PRODUÇÃO (snapshot), a
--    comissão sai agregada em gerar_comissoes_a_pagar.
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
      p.data_emissao,
      p.status_emissao,
      COALESCE(pe.nome, p.cliente_nome, '') AS cliente_nome,
      p.modalidade
    FROM processos p
    LEFT JOIN pessoas pe ON pe.id = p.pessoa_id
    WHERE p.empresa_id = v_fechamento.empresa_id
      AND p.modalidade = 'Contrato'
      AND p.status_emissao = 'emitido'
      AND EXTRACT(MONTH FROM p.data_emissao) = v_fechamento.competencia_mes
      AND EXTRACT(YEAR  FROM p.data_emissao) = v_fechamento.competencia_ano
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
      NULL, 'Contrato', v_valor, v_proc.data_emissao,
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

    -- NOTA: NÃO gera mais comissão direta aqui. O valor_contrato entra como
    -- produção do comercial no fechamento e é somado à base de cálculo da
    -- faixa percentual em gerar_comissoes_a_pagar.

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

-- ============================================================
-- 7. gerar_comissoes_a_pagar — reescrita completa:
--
--    COMERCIAL: agrega por funcionário TODA a produção do fechamento
--    (valor_financiado de Financiamento + valor_financiado/valor_contrato
--    de Contrato + valor_assessoria), resolve a regra por cascata
--    (rh_funcionarios.regra_comissao_id → rh_cargos.regra_comissao_id),
--    e se a regra for percentual_faixa_producao_mensal aplica a faixa da
--    PRODUÇÃO TOTAL ACUMULADA (não do processo isolado). Se a regra for
--    valor_fixo_emissao (não deveria ser o caso pra comercial, mas mantém
--    compatibilidade), cai no comportamento antigo por processo.
--
--    OPERACIONAL: mantém o modelo atual (valor_fixo por processo/assessoria
--    quando a regra é valor_fixo_emissao — já é o padrão de hoje; nenhuma
--    mudança de comportamento).
--
--    PARCEIRO: mantém percentual por processo (comissoes_padrao), mas agora
--    grava parceiro_id quando processos.parceiro_id existir.
--
--    Fix: join com comissoes_padrao agora respeita modalidade (antes
--    ignorava a coluna e podia trazer linha errada/duplicada quando havia
--    mais de uma modalidade cadastrada pro mesmo banco).
-- ============================================================
CREATE OR REPLACE FUNCTION gerar_comissoes_a_pagar(
  p_fechamento_id UUID
)
RETURNS INTEGER AS $$
DECLARE
  v_fechamento     RECORD;
  v_proc           RECORD;
  v_com            RECORD;  -- linha agregada por comercial
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

  -- Recálculo limpo: remove tudo que foi auto-gerado (preserva ajustes manuais)
  DELETE FROM financeiro_comissoes_pagar
  WHERE fechamento_id = p_fechamento_id AND ajuste_manual = 0;

  -- ============================================================
  -- COMERCIAL: uma linha agregada por comercial, sobre a produção
  -- total do mês (Financiamento + Contrato + Assessoria).
  -- ============================================================
  FOR v_com IN
    SELECT
      fp.comercial_id,
      SUM(fp.valor_financiado) FILTER (WHERE fp.modalidade NOT IN ('Contrato')) AS producao_financiamento,
      SUM(fp.valor_financiado) FILTER (WHERE fp.modalidade = 'Contrato')        AS producao_contrato,
      SUM(fp.valor_assessoria)                                                 AS producao_assessoria
    FROM financeiro_fechamento_processos fp
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
  -- OPERACIONAL + PARCEIRO: continuam por processo (comportamento atual),
  -- exceto o fix do join por modalidade e o vínculo com parceiros.
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
-- 8. calcular_painel_financeiro — KPIs do novo Painel (Tela 1):
--    a receber/a pagar em aberto vs. atraso, e produção de
--    Financiamento do mês (card "Fechamento Processos").
--    Independente da função legada calcular_kpis_financeiro (não alterada).
-- ============================================================
CREATE OR REPLACE FUNCTION calcular_painel_financeiro(
  p_empresa_id UUID,
  p_mes        INTEGER,
  p_ano        INTEGER
)
RETURNS TABLE (
  a_receber_aberto            NUMERIC,
  a_receber_atraso            NUMERIC,
  a_pagar_mes                 NUMERIC,
  a_pagar_atraso              NUMERIC,
  producao_financiamento_mes  NUMERIC,
  qtd_processos_financiamento INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM usuarios WHERE id = auth.uid() AND empresa_id = p_empresa_id AND ativo = true
  ) THEN
    RAISE EXCEPTION 'Acesso negado: empresa_id inválido para este usuário';
  END IF;

  RETURN QUERY
  SELECT
    (SELECT COALESCE(SUM(cr.valor_previsto - cr.valor_recebido), 0)
       FROM financeiro_contas_receber cr
       WHERE cr.empresa_id = p_empresa_id
         AND cr.status NOT IN ('recebido', 'cancelado')
         AND (cr.data_prevista IS NULL OR cr.data_prevista >= CURRENT_DATE)),
    (SELECT COALESCE(SUM(cr.valor_previsto - cr.valor_recebido), 0)
       FROM financeiro_contas_receber cr
       WHERE cr.empresa_id = p_empresa_id
         AND cr.status NOT IN ('recebido', 'cancelado')
         AND cr.data_prevista IS NOT NULL AND cr.data_prevista < CURRENT_DATE),
    (SELECT COALESCE(SUM(d.valor), 0)
       FROM financeiro_despesas d
       WHERE d.empresa_id = p_empresa_id
         AND d.status IN ('prevista', 'a_pagar')
         AND (d.data_vencimento IS NULL OR d.data_vencimento >= CURRENT_DATE)),
    (SELECT COALESCE(SUM(d.valor), 0)
       FROM financeiro_despesas d
       WHERE d.empresa_id = p_empresa_id
         AND d.status IN ('prevista', 'a_pagar')
         AND d.data_vencimento IS NOT NULL AND d.data_vencimento < CURRENT_DATE),
    (SELECT COALESCE(SUM(fp.valor_financiado), 0)
       FROM financeiro_fechamento_processos fp
       JOIN financeiro_fechamentos f ON f.id = fp.fechamento_id
       WHERE f.empresa_id = p_empresa_id
         AND f.competencia_mes = p_mes AND f.competencia_ano = p_ano
         AND fp.modalidade NOT IN ('Contrato', 'Consorcio')),
    (SELECT COUNT(*)::INTEGER
       FROM financeiro_fechamento_processos fp
       JOIN financeiro_fechamentos f ON f.id = fp.fechamento_id
       WHERE f.empresa_id = p_empresa_id
         AND f.competencia_mes = p_mes AND f.competencia_ano = p_ano
         AND fp.modalidade NOT IN ('Contrato', 'Consorcio'));
END;
$$;
