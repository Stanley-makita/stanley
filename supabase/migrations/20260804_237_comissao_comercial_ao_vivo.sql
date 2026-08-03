-- Migration 237: Comissão comercial ao vivo + Fechamento automático
--
-- Contexto: a tabela de Negócios > Financiamento mostra "Comissão Comercial"/
-- "Comissão Empresa" por processo, hoje vindas de um sistema legado
-- (processos.comissao_comercial/comissao_empresa, percentual copiado de
-- comissoes_padrao por banco) — desconectado do motor novo de comissão
-- (regra do RH, por faixa de produção mensal) construído na migration 235.
--
-- Decisão do usuário:
--   1. Essas colunas só mostram valor depois de status_emissao = 'emitido'
--      (antes disso ficam em branco, sem estimativa).
--   2. Comissão Comercial passa a vir da regra do RH (motor novo); Comissão
--      Empresa continua vindo do banco (comissoes_padrao, inalterado).
--   3. A Receber e Comissões a Pagar calculam ao vivo direto dos processos
--      emitidos, sem exigir "Puxar Processos"/"Gerar Comissões" manuais.
--
-- Como a comissão do comercial agora é sobre produção ACUMULADA do mês (não
-- por processo isolado), o valor mostrado numa linha é uma fatia
-- proporcional: comissão_total_do_mês × (contribuição_do_processo /
-- produção_total_do_mês). É dinâmico por natureza — muda conforme mais
-- processos do mesmo comercial são emitidos no mês, igual à planilha.

-- ============================================================
-- 1. Helper: agregação mensal ao vivo (lê processos diretamente, sem
--    depender de fechamento aberto). Mesma lógica do bloco COMERCIAL de
--    gerar_comissoes_a_pagar (migration 235), mas fonte é `processos`.
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
    COALESCE(SUM(p.valor_financiado) FILTER (WHERE p.modalidade NOT IN ('Contrato', 'Consorcio')), 0),
    COALESCE(SUM(p.valor_contrato)   FILTER (WHERE p.modalidade = 'Contrato'), 0),
    COALESCE(SUM(p.valor_assessoria), 0)
  INTO v_producao_financiamento, v_producao_contrato, v_producao_assessoria
  FROM processos p
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

  RETURN QUERY SELECT
    v_producao_total,
    v_pct,
    v_valor,
    v_regra_id,
    CASE WHEN v_func_found THEN v_func.func_id ELSE NULL END;
END;
$$;

-- ============================================================
-- 2. Computed columns em `processos` (padrão PostgREST: função cujo 1º
--    parâmetro é o tipo da tabela vira coluna virtual no select()).
--    NULL antes de emitido — sem estimativa prévia.
-- ============================================================
CREATE OR REPLACE FUNCTION comissao_comercial_calculada(processos)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_contribuicao NUMERIC;
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
    v_contribuicao := COALESCE($1.valor_financiado, 0) + COALESCE($1.valor_assessoria, 0);
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

CREATE OR REPLACE FUNCTION comissao_empresa_calculada(processos)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_pct NUMERIC;
BEGIN
  IF $1.status_emissao IS DISTINCT FROM 'emitido' OR $1.banco_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT cp.comissao_empresa
  INTO v_pct
  FROM comissoes_padrao cp
  WHERE cp.empresa_id = $1.empresa_id
    AND cp.banco_id = $1.banco_id
    AND (cp.modalidade = '' OR cp.modalidade = $1.modalidade::TEXT)
  ORDER BY (cp.modalidade <> '') DESC
  LIMIT 1;

  IF v_pct IS NULL THEN RETURN NULL; END IF;

  RETURN ROUND(COALESCE($1.valor_financiado, 0) * v_pct / 100, 2);
END;
$$;

-- ============================================================
-- 3. RPCs de preview ao vivo — mesma lógica de puxar_processos_emitidos/
--    puxar_contratos/gerar_comissoes_a_pagar, mas 100% leitura, direto de
--    `processos`, sem exigir fechamento aberto.
-- ============================================================
CREATE OR REPLACE FUNCTION contas_a_receber_mes_preview(
  p_empresa_id UUID,
  p_mes        INTEGER,
  p_ano        INTEGER
)
RETURNS TABLE (
  id                    UUID,
  processo_id           UUID,
  banco_id              UUID,
  banco_nome            TEXT,
  banco_cor             TEXT,
  cliente_nome          TEXT,
  origem                TEXT,
  valor_base            NUMERIC,
  percentual_previsto   NUMERIC,
  valor_previsto        NUMERIC
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
    gen_random_uuid(),
    p.id,
    p.banco_id,
    b.nome,
    b.cor,
    COALESCE(pe.nome, pc.nome, ''),
    'emissao'::TEXT,
    COALESCE(p.valor_financiado, 0),
    COALESCE(cp.comissao_empresa, 0),
    ROUND(COALESCE(p.valor_financiado, 0) * COALESCE(cp.comissao_empresa, 0) / 100, 2)
  FROM processos p
  LEFT JOIN bancos b ON b.id = p.banco_id
  LEFT JOIN pessoas pe ON pe.id = p.pessoa_id
  LEFT JOIN LATERAL (
    SELECT nome FROM processo_compradores WHERE processo_id = p.id
    ORDER BY principal DESC NULLS LAST LIMIT 1
  ) pc ON true
  LEFT JOIN LATERAL (
    SELECT comissao_empresa FROM comissoes_padrao x
    WHERE x.banco_id = p.banco_id AND x.empresa_id = p.empresa_id
      AND (x.modalidade = '' OR x.modalidade = p.modalidade::TEXT)
    ORDER BY (x.modalidade <> '') DESC
    LIMIT 1
  ) cp ON true
  WHERE p.empresa_id = p_empresa_id
    AND p.status_emissao = 'emitido'
    AND p.modalidade NOT IN ('Contrato', 'Consorcio')
    AND p.data_emissao IS NOT NULL
    AND EXTRACT(MONTH FROM p.data_emissao) = p_mes
    AND EXTRACT(YEAR  FROM p.data_emissao) = p_ano

  UNION ALL

  SELECT
    gen_random_uuid(),
    p.id,
    NULL, NULL, NULL,
    COALESCE(pe.nome, pc.nome, ''),
    'contrato'::TEXT,
    COALESCE(p.valor_contrato, 0),
    0,
    COALESCE(p.valor_contrato, 0)
  FROM processos p
  LEFT JOIN pessoas pe ON pe.id = p.pessoa_id
  LEFT JOIN LATERAL (
    SELECT nome FROM processo_compradores WHERE processo_id = p.id
    ORDER BY principal DESC NULLS LAST LIMIT 1
  ) pc ON true
  WHERE p.empresa_id = p_empresa_id
    AND p.modalidade = 'Contrato'
    AND p.status_emissao = 'emitido'
    AND p.data_emissao IS NOT NULL
    AND EXTRACT(MONTH FROM p.data_emissao) = p_mes
    AND EXTRACT(YEAR  FROM p.data_emissao) = p_ano;
END;
$$;

CREATE OR REPLACE FUNCTION comissoes_a_pagar_mes_preview(
  p_empresa_id UUID,
  p_mes        INTEGER,
  p_ano        INTEGER
)
RETURNS TABLE (
  id                UUID,
  processo_id       UUID,
  usuario_id        UUID,
  funcionario_id    UUID,
  tipo_destinatario TEXT,
  papel             TEXT,
  pessoa_nome       TEXT,
  valor_base        NUMERIC,
  percentual        NUMERIC,
  valor_calculado   NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_com  RECORD;
  v_prod RECORD;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM usuarios WHERE id = auth.uid() AND empresa_id = p_empresa_id AND ativo = true
  ) THEN
    RAISE EXCEPTION 'Acesso negado: empresa_id inválido para este usuário';
  END IF;

  -- COMERCIAL: uma linha por comercial, produção agregada do mês
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
    SELECT * INTO v_prod
    FROM calcular_producao_comercial_mes(p_empresa_id, v_com.comercial_id, p_mes, p_ano);

    IF v_prod.comissao_total > 0 THEN
      id                := gen_random_uuid();
      processo_id       := NULL;
      usuario_id        := v_com.comercial_id;
      funcionario_id    := v_prod.funcionario_id;
      tipo_destinatario := CASE WHEN v_prod.funcionario_id IS NOT NULL THEN 'funcionario' ELSE 'usuario' END;
      papel             := 'comercial';
      pessoa_nome       := v_com.comercial_nome;
      valor_base        := v_prod.producao_total;
      percentual        := v_prod.pct_aplicado;
      valor_calculado   := v_prod.comissao_total;
      RETURN NEXT;
    END IF;
  END LOOP;

  -- OPERACIONAL: por processo, mesmo modelo legado (comissoes_padrao)
  RETURN QUERY
  SELECT
    gen_random_uuid(),
    p.id,
    p.operacional_id,
    NULL::UUID,
    'usuario'::TEXT,
    'operacional'::TEXT,
    uo.nome,
    COALESCE(p.valor_financiado, 0),
    COALESCE(cp.comissao_operacional, 0),
    ROUND(COALESCE(p.valor_financiado, 0) * COALESCE(cp.comissao_operacional, 0) / 100, 2)
  FROM processos p
  JOIN usuarios uo ON uo.id = p.operacional_id
  LEFT JOIN LATERAL (
    SELECT comissao_operacional FROM comissoes_padrao x
    WHERE x.banco_id = p.banco_id AND x.empresa_id = p.empresa_id
      AND (x.modalidade = '' OR x.modalidade = p.modalidade::TEXT)
    ORDER BY (x.modalidade <> '') DESC
    LIMIT 1
  ) cp ON true
  WHERE p.empresa_id = p_empresa_id
    AND p.operacional_id IS NOT NULL
    AND p.status_emissao = 'emitido'
    AND p.modalidade NOT IN ('Contrato', 'Consorcio')
    AND p.data_emissao IS NOT NULL
    AND EXTRACT(MONTH FROM p.data_emissao) = p_mes
    AND EXTRACT(YEAR  FROM p.data_emissao) = p_ano
    AND COALESCE(cp.comissao_operacional, 0) > 0

  UNION ALL

  -- PARCEIRO: por processo, mesmo modelo legado (comissoes_padrao)
  SELECT
    gen_random_uuid(),
    p.id,
    NULL,
    NULL,
    'externo'::TEXT,
    'parceiro'::TEXT,
    COALESCE(pa.nome, 'Parceiro'),
    COALESCE(p.valor_financiado, 0),
    COALESCE(cp.comissao_parceiro, 0),
    ROUND(COALESCE(p.valor_financiado, 0) * COALESCE(cp.comissao_parceiro, 0) / 100, 2)
  FROM processos p
  LEFT JOIN parceiros pa ON pa.id = p.parceiro_id
  LEFT JOIN LATERAL (
    SELECT comissao_parceiro FROM comissoes_padrao x
    WHERE x.banco_id = p.banco_id AND x.empresa_id = p.empresa_id
      AND (x.modalidade = '' OR x.modalidade = p.modalidade::TEXT)
    ORDER BY (x.modalidade <> '') DESC
    LIMIT 1
  ) cp ON true
  WHERE p.empresa_id = p_empresa_id
    AND p.status_emissao = 'emitido'
    AND p.modalidade NOT IN ('Contrato', 'Consorcio')
    AND p.data_emissao IS NOT NULL
    AND EXTRACT(MONTH FROM p.data_emissao) = p_mes
    AND EXTRACT(YEAR  FROM p.data_emissao) = p_ano
    AND COALESCE(cp.comissao_parceiro, 0) > 0;

  RETURN;
END;
$$;

-- ============================================================
-- 4. calcular_painel_financeiro — a_receber passa a computar ao vivo de
--    `processos` quando o mês ainda não tem fechamento aprovado/travado
--    (senão usa o snapshot persistido, que já rastreia recebimento real).
--    a_pagar continua igual (já era independente de fechamento).
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
  a_pagar_atraso               NUMERIC,
  producao_financiamento_mes  NUMERIC,
  qtd_processos_financiamento INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_fechamento RECORD;
  v_snapshot   BOOLEAN;
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

  RETURN QUERY
  SELECT
    CASE WHEN v_snapshot THEN
      (SELECT COALESCE(SUM(cr.valor_previsto - cr.valor_recebido), 0)
         FROM financeiro_contas_receber cr
         WHERE cr.empresa_id = p_empresa_id
           AND cr.status NOT IN ('recebido', 'cancelado')
           AND (cr.data_prevista IS NULL OR cr.data_prevista >= CURRENT_DATE))
    ELSE
      (SELECT COALESCE(SUM(x.valor_previsto), 0) FROM contas_a_receber_mes_preview(p_empresa_id, p_mes, p_ano) x)
    END,
    CASE WHEN v_snapshot THEN
      (SELECT COALESCE(SUM(cr.valor_previsto - cr.valor_recebido), 0)
         FROM financeiro_contas_receber cr
         WHERE cr.empresa_id = p_empresa_id
           AND cr.status NOT IN ('recebido', 'cancelado')
           AND cr.data_prevista IS NOT NULL AND cr.data_prevista < CURRENT_DATE)
    ELSE
      0::NUMERIC
    END,
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
    (SELECT COALESCE(SUM(p.valor_financiado), 0)
       FROM processos p
       WHERE p.empresa_id = p_empresa_id
         AND p.status_emissao = 'emitido'
         AND p.modalidade NOT IN ('Contrato', 'Consorcio')
         AND p.data_emissao IS NOT NULL
         AND EXTRACT(MONTH FROM p.data_emissao) = p_mes
         AND EXTRACT(YEAR  FROM p.data_emissao) = p_ano),
    (SELECT COUNT(*)::INTEGER
       FROM processos p
       WHERE p.empresa_id = p_empresa_id
         AND p.status_emissao = 'emitido'
         AND p.modalidade NOT IN ('Contrato', 'Consorcio')
         AND p.data_emissao IS NOT NULL
         AND EXTRACT(MONTH FROM p.data_emissao) = p_mes
         AND EXTRACT(YEAR  FROM p.data_emissao) = p_ano);
END;
$$;

-- ============================================================
-- 5. preparar_fechamento — encadeia puxar_processos_emitidos, puxar_contratos,
--    gerar_comissoes_a_pagar, gerar_folha e executar_conferencias, todas já
--    existentes e inalteradas (só reordena QUANDO rodam: antes eram cliques
--    manuais separados, agora rodam juntas ao preparar a aprovação).
--
--    Importante: esta função NÃO lança exceção por conferências críticas —
--    ela sempre roda e persiste o resultado (puxados, comissões, folha,
--    conferências), mesmo se houver pendências críticas. Quem bloqueia a
--    aprovação é aprovar_fechamento (função já existente, inalterada), que
--    só checa a contagem — assim, se a aprovação for rejeitada, o usuário
--    ainda vê os dados puxados e as conferências para corrigir, em vez de
--    tudo ser desfeito (o que aconteceria se aprovar_fechamento fizesse
--    tudo numa função só e desse RAISE EXCEPTION no fim).
-- ============================================================
CREATE OR REPLACE FUNCTION preparar_fechamento(
  p_fechamento_id UUID
)
RETURNS VOID AS $$
DECLARE
  v_fechamento RECORD;
BEGIN
  SELECT f.*
  INTO v_fechamento
  FROM financeiro_fechamentos f
  JOIN usuarios u ON u.id = auth.uid()
  WHERE f.id = p_fechamento_id AND f.empresa_id = u.empresa_id AND u.ativo = true;

  IF NOT FOUND THEN RAISE EXCEPTION 'Fechamento não encontrado ou acesso negado'; END IF;
  IF v_fechamento.status = 'travado' THEN RAISE EXCEPTION 'Fechamento travado'; END IF;

  PERFORM puxar_processos_emitidos(p_fechamento_id);
  PERFORM puxar_contratos(p_fechamento_id);
  PERFORM gerar_comissoes_a_pagar(p_fechamento_id);
  PERFORM gerar_folha(p_fechamento_id);
  PERFORM executar_conferencias(p_fechamento_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
