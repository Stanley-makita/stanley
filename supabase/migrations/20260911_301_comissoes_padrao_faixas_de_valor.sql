-- Migration 301: Comissões por Banco vira faixas de valor financiado +
-- novo teto de comissão em R$
--
-- Redesenho confirmado com o usuário:
--   1. Piso/Teto (colunas já existentes em comissoes_padrao) deixam de
--      ser ignorados (confirmamos hoje que nenhuma função lia essas
--      colunas) e passam a significar: a partir de que valor financiado
--      (piso) e até que valor (teto, 0 = sem limite) aquele percentual
--      daquela linha vale. Isso permite MÚLTIPLAS linhas por banco+
--      modalidade — uma por faixa de valor — então a constraint única
--      antiga (1 linha por banco+modalidade) precisa cair.
--   2. Novo campo valor_maximo_comissao: um teto em R$ sobre o RESULTADO
--      calculado (%% × valor) de um processo — conceito diferente de
--      Piso/Teto (que decidem qual %% usar, não limitam o resultado).
--
-- Onde cada mudança se aplica:
--   a) Faixa de valor (Piso/Teto escolhendo a linha certa): em TODO
--      lugar que hoje busca comissoes_padrao — sempre foi um bug de
--      correção escolher a linha errada quando existir mais de uma.
--   b) Teto de comissão (valor_maximo_comissao): SÓ nos cálculos que
--      representam um valor de comissão "de referência" por processo
--      isolado — comissao_comercial_calculada, comissao_empresa_
--      calculada, a coluna "comissao" de analise_comissoes_mes, contas_
--      a_receber_mes_vivo, garantir_conta_receber_processo,
--      puxar_processos_emitidos, e o bloco OPERACIONAL/PARCEIRO de
--      gerar_comissoes_a_pagar. NÃO se aplica
--      dentro de calcular_producao_comercial_mes, do bloco COMERCIAL de
--      gerar_comissoes_a_pagar, nem do comissao_financiamento de
--      comissao_apurada_mes — esses três formam o motor de faixa de
--      produção mensal do RH (o pagamento real ao comercial), que o
--      usuário confirmou que deve continuar exatamente como está,
--      independente dessa mudança.
--
-- comissao_comercial_calculada também muda de modelo: deixa de ser uma
-- fatia proporcional da comissão mensal do comercial (rateio pela faixa
-- do RH) e passa a ser um cálculo direto por processo — %%comercial da
-- faixa de valor certa × valor_financiado, capado por
-- valor_maximo_comissao. Essa é a mesma função usada em Negócios >
-- Financiamento (coluna pré-existente) e na nova coluna de Análise de
-- Comissões > Financiamento — as duas mudam juntas.

-- ============================================================
-- 0. Schema: cai a trava de 1 linha por banco+modalidade, entra o teto
--    de comissão em R$.
-- ============================================================
ALTER TABLE comissoes_padrao
  DROP CONSTRAINT IF EXISTS comissoes_padrao_empresa_banco_modalidade_key;

ALTER TABLE comissoes_padrao
  ADD COLUMN IF NOT EXISTS valor_maximo_comissao NUMERIC(14,2) NOT NULL DEFAULT 0;

-- ============================================================
-- 1. calcular_producao_comercial_mes — corpo idêntico à migration 300,
--    só a LATERAL de comissoes_padrao ganha o filtro de faixa de valor
--    (piso/teto). Sem teto de comissão aqui (motor de pagamento real).
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
    COALESCE(SUM(p.valor_financiado * COALESCE(cp.comissao_comercial, 0) / 100)
             FILTER (
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
    SELECT x.comissao_comercial FROM comissoes_padrao x
    WHERE x.banco_id = p.banco_id AND x.empresa_id = p.empresa_id
      AND (x.modalidade = '' OR x.modalidade = p.modalidade::TEXT)
      AND COALESCE(p.valor_financiado, 0) >= x.piso_valor
      AND (x.teto_valor = 0 OR COALESCE(p.valor_financiado, 0) <= x.teto_valor)
    ORDER BY (x.modalidade <> '') DESC, x.piso_valor DESC
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
-- 2. gerar_comissoes_a_pagar — bloco COMERCIAL ganha só o filtro de
--    faixa de valor (sem teto de comissão, mesmo motivo do item 1).
--    Bloco OPERACIONAL+PARCEIRO: a LATERAL antiga era um JOIN comum
--    (sem LATERAL/LIMIT) — com múltiplas linhas por banco+modalidade
--    isso agora causaria fanout (processo duplicado se 2 faixas de
--    valor existirem pro mesmo banco). Vira LATERAL com filtro de faixa
--    + LIMIT 1, e passa a aplicar o teto de comissão (valor_maximo_
--    comissao) sobre o valor calculado de cada um.
-- ============================================================
CREATE OR REPLACE FUNCTION gerar_comissoes_a_pagar(
  p_fechamento_id UUID
)
RETURNS INTEGER AS $$
DECLARE
  v_fechamento             RECORD;
  v_proc                   RECORD;
  v_com                    RECORD;
  v_func                   RECORD;
  v_faixa                  RECORD;
  v_regra                  RECORD;
  v_regra_id               UUID;
  v_tipo_calculo           TEXT;
  v_cgi_valor_limite       NUMERIC;
  v_cgi_percentual_acima   NUMERIC;
  v_pct                    NUMERIC;
  v_piso                   NUMERIC;
  v_teto                   NUMERIC;
  v_valor                  NUMERIC;
  v_producao_financiamento NUMERIC;
  v_producao_contrato      NUMERIC;
  v_producao_assessoria    NUMERIC;
  v_producao_cgi_especial  NUMERIC;
  v_valor_financiado_bruto NUMERIC;
  v_producao_total         NUMERIC;
  v_valor_faixa            NUMERIC;
  v_count                  INTEGER := 0;
  v_func_found             BOOLEAN;
  v_faixa_found            BOOLEAN;
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
  -- COMERCIAL: um comercial por vez — resolve a regra dele primeiro, e
  -- usa o valor BRUTO financiado (não o subtotal ponderado) como chave
  -- da faixa. Motor de pagamento real — sem teto de comissão.
  -- ============================================================
  FOR v_com IN
    SELECT DISTINCT fp.comercial_id
    FROM financeiro_fechamento_processos fp
    WHERE fp.fechamento_id = p_fechamento_id
      AND fp.comercial_id IS NOT NULL
  LOOP
    v_func_found  := false;
    v_faixa_found := false;
    v_regra_id    := NULL;
    v_tipo_calculo         := NULL;
    v_cgi_valor_limite     := NULL;
    v_cgi_percentual_acima := NULL;
    v_pct  := 0;
    v_piso := 0;
    v_teto := 0;

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
      COALESCE(SUM(fp.valor_financiado * COALESCE(cp.comissao_comercial, 0) / 100)
               FILTER (
                 WHERE fp.modalidade NOT IN ('Contrato')
                   AND NOT (
                     fp.modalidade = 'CGI' AND v_cgi_valor_limite IS NOT NULL
                     AND fp.valor_financiado > v_cgi_valor_limite
                   )
               ), 0),
      COALESCE(SUM(fp.valor_financiado) FILTER (WHERE fp.modalidade = 'Contrato'), 0),
      COALESCE(SUM(fp.valor_assessoria), 0),
      COALESCE(SUM(fp.valor_financiado * v_cgi_percentual_acima / 100)
               FILTER (
                 WHERE fp.modalidade = 'CGI' AND v_cgi_valor_limite IS NOT NULL
                   AND fp.valor_financiado > v_cgi_valor_limite
               ), 0),
      COALESCE(SUM(fp.valor_financiado)
               FILTER (
                 WHERE fp.modalidade NOT IN ('Contrato')
                   AND NOT (
                     fp.modalidade = 'CGI' AND v_cgi_valor_limite IS NOT NULL
                     AND fp.valor_financiado > v_cgi_valor_limite
                   )
               ), 0)
    INTO v_producao_financiamento, v_producao_contrato, v_producao_assessoria, v_producao_cgi_especial, v_valor_financiado_bruto
    FROM financeiro_fechamento_processos fp
    LEFT JOIN LATERAL (
      SELECT x.comissao_comercial FROM comissoes_padrao x
      WHERE x.banco_id = fp.banco_id AND x.empresa_id = fp.empresa_id
        AND (x.modalidade = '' OR x.modalidade = fp.modalidade)
        AND COALESCE(fp.valor_financiado, 0) >= x.piso_valor
        AND (x.teto_valor = 0 OR COALESCE(fp.valor_financiado, 0) <= x.teto_valor)
      ORDER BY (x.modalidade <> '') DESC, x.piso_valor DESC
      LIMIT 1
    ) cp ON true
    WHERE fp.fechamento_id = p_fechamento_id
      AND fp.comercial_id = v_com.comercial_id;

    v_producao_total := COALESCE(v_producao_financiamento, 0)
                       + COALESCE(v_producao_contrato, 0)
                       + COALESCE(v_producao_assessoria, 0);

    IF v_tipo_calculo = 'percentual_faixa_producao_mensal' THEN
      SELECT *
      INTO v_faixa
      FROM rh_faixas_comissao
      WHERE regra_id = v_regra_id
        AND valor_minimo <= v_valor_financiado_bruto
        AND (valor_maximo = 0 OR valor_maximo >= v_valor_financiado_bruto)
      ORDER BY valor_minimo DESC
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

    v_valor := v_valor_faixa + COALESCE(v_producao_cgi_especial, 0);

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

    IF v_tipo_calculo = 'percentual_faixa_producao_mensal' AND NOT v_faixa_found THEN
      INSERT INTO financeiro_conferencias (
        empresa_id, fechamento_id, tipo, severidade, status, titulo, descricao,
        entidade_tipo, entidade_id
      ) VALUES (
        v_fechamento.empresa_id, p_fechamento_id, 'processo_sem_faixa_comissao', 'alerta', 'pendente',
        'Sem faixa de comissão aplicável',
        'O valor bruto financiado do comercial no mês não se enquadra em nenhuma faixa cadastrada na regra de comissão.',
        'financeiro_fechamento_processos', NULL
      ) ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  -- ============================================================
  -- OPERACIONAL + PARCEIRO: por processo. Antes era um JOIN comum a
  -- comissoes_padrao (sem LATERAL) — vira LATERAL com filtro de faixa de
  -- valor e LIMIT 1 pra não duplicar o processo se houver mais de uma
  -- faixa cadastrada pro banco. Passa a aplicar o teto de comissão.
  -- ============================================================
  FOR v_proc IN
    SELECT fp.*, p.parceiro_id,
           cp.comissao_operacional, cp.comissao_parceiro, cp.valor_maximo_comissao
    FROM financeiro_fechamento_processos fp
    LEFT JOIN processos p ON p.id = fp.processo_id
    LEFT JOIN LATERAL (
      SELECT x.comissao_operacional, x.comissao_parceiro, x.valor_maximo_comissao
      FROM comissoes_padrao x
      WHERE x.banco_id = fp.banco_id AND x.empresa_id = fp.empresa_id
        AND (x.modalidade = '' OR x.modalidade = fp.modalidade)
        AND COALESCE(fp.valor_financiado, 0) >= x.piso_valor
        AND (x.teto_valor = 0 OR COALESCE(fp.valor_financiado, 0) <= x.teto_valor)
      ORDER BY (x.modalidade <> '') DESC, x.piso_valor DESC
      LIMIT 1
    ) cp ON true
    WHERE fp.fechamento_id = p_fechamento_id
      AND fp.modalidade <> 'Contrato'
  LOOP
    IF v_proc.operacional_id IS NOT NULL AND COALESCE(v_proc.comissao_operacional, 0) > 0 THEN
      v_valor := COALESCE(v_proc.valor_financiado, 0) * COALESCE(v_proc.comissao_operacional, 0) / 100;
      IF COALESCE(v_proc.valor_maximo_comissao, 0) > 0 THEN
        v_valor := LEAST(v_valor, v_proc.valor_maximo_comissao);
      END IF;

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
      IF COALESCE(v_proc.valor_maximo_comissao, 0) > 0 THEN
        v_valor := LEAST(v_valor, v_proc.valor_maximo_comissao);
      END IF;

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
-- 2b. puxar_processos_emitidos — corpo idêntico à migration 296, LATERAL
--    de comissoes_padrao ganha filtro de faixa de valor + teto de
--    comissão (esta função PERSISTE o valor_previsto do recebível no
--    momento em que o processo entra no fechamento — mesmo grupo do
--    item 5/6, era o único leitor de comissoes_padrao que faltava
--    atualizar).
-- ============================================================
CREATE OR REPLACE FUNCTION puxar_processos_emitidos(
  p_fechamento_id UUID
)
RETURNS INTEGER AS $$
DECLARE
  v_fechamento    RECORD;
  v_proc          RECORD;
  v_pct_empresa   NUMERIC;
  v_teto_empresa  NUMERIC;
  v_valor_previsto NUMERIC;
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
      AND p.status_emissao = 'emitido'
      AND p.modalidade NOT IN ('Contrato', 'Consorcio')
      AND EXTRACT(MONTH FROM p.data_emissao) = v_fechamento.competencia_mes
      AND EXTRACT(YEAR  FROM p.data_emissao) = v_fechamento.competencia_ano
      AND NOT EXISTS (
        SELECT 1 FROM financeiro_fechamento_processos fp
        WHERE fp.processo_id = p.id AND fp.fechamento_id = p_fechamento_id
      )
  LOOP
    SELECT cp.comissao_empresa, cp.valor_maximo_comissao
    INTO v_pct_empresa, v_teto_empresa
    FROM comissoes_padrao cp
    WHERE cp.empresa_id = v_fechamento.empresa_id AND cp.banco_id = v_proc.banco_id
      AND (cp.modalidade = '' OR cp.modalidade = v_proc.modalidade)
      AND COALESCE(v_proc.valor_financiado, 0) >= cp.piso_valor
      AND (cp.teto_valor = 0 OR COALESCE(v_proc.valor_financiado, 0) <= cp.teto_valor)
    ORDER BY (cp.modalidade <> '') DESC, cp.piso_valor DESC
    LIMIT 1;

    IF NOT FOUND THEN v_pct_empresa := 0; v_teto_empresa := 0; END IF;

    v_valor_previsto := ROUND(COALESCE(v_proc.valor_financiado, 0) * COALESCE(v_pct_empresa, 0) / 100, 2);
    IF COALESCE(v_teto_empresa, 0) > 0 THEN
      v_valor_previsto := LEAST(v_valor_previsto, v_teto_empresa);
    END IF;

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
      'emissao', COALESCE(v_proc.valor_financiado, 0), COALESCE(v_pct_empresa, 0),
      v_valor_previsto,
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
-- 3. analise_comissoes_mes — corpo idêntico à migration 299, LATERAL de
--    comissoes_padrao ganha filtro de faixa de valor, e a coluna
--    "comissao" (referência de comissão empresa por processo) passa a
--    respeitar o teto de comissão.
-- ============================================================
CREATE OR REPLACE FUNCTION analise_comissoes_mes(
  p_empresa_id UUID,
  p_mes        INTEGER,
  p_ano        INTEGER
)
RETURNS TABLE (
  id                    UUID,
  processo_id           UUID,
  cliente_nome          TEXT,
  cliente_cpf           TEXT,
  banco_nome            TEXT,
  banco_cor             TEXT,
  modalidade            TEXT,
  valor_financiado      NUMERIC,
  comercial_nome        TEXT,
  valor_assessoria      NUMERIC,
  percentual_comissao   NUMERIC,
  comissao              NUMERIC,
  responsavel_registro  TEXT,
  comissao_comercial    NUMERIC,
  cgi_especial          BOOLEAN,
  data_emissao          DATE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.empresa_id = p_empresa_id AND u.ativo = true
  ) THEN
    RAISE EXCEPTION 'Acesso negado: empresa_id inválido para este usuário';
  END IF;

  RETURN QUERY
  SELECT
    p.id                                AS id,
    p.id                                AS processo_id,
    COALESCE(pc.nome, pe.nome, '')      AS cliente_nome,
    COALESCE(pc.cpf, pe.cpf, '')        AS cliente_cpf,
    b.nome                              AS banco_nome,
    b.cor                               AS banco_cor,
    p.modalidade::TEXT                  AS modalidade,
    p.valor_financiado                  AS valor_financiado,
    uc.nome                             AS comercial_nome,
    COALESCE(p.valor_assessoria, 0)     AS valor_assessoria,
    COALESCE(cp.comissao_empresa, 0)    AS percentual_comissao,
    CASE
      WHEN COALESCE(cp.valor_maximo_comissao, 0) > 0
        THEN LEAST(ROUND(COALESCE(p.valor_financiado, 0) * COALESCE(cp.comissao_empresa, 0) / 100, 2), cp.valor_maximo_comissao)
      ELSE ROUND(COALESCE(p.valor_financiado, 0) * COALESCE(cp.comissao_empresa, 0) / 100, 2)
    END                                  AS comissao,
    p.responsavel_registro              AS responsavel_registro,
    comissao_comercial_calculada(p)     AS comissao_comercial,
    COALESCE(
      p.modalidade = 'CGI' AND cgi.cgi_valor_limite IS NOT NULL
      AND p.valor_financiado > cgi.cgi_valor_limite,
      false
    )                                    AS cgi_especial,
    p.data_emissao                      AS data_emissao
  FROM processos p
  LEFT JOIN bancos b ON b.id = p.banco_id
  LEFT JOIN usuarios uc ON uc.id = p.comercial_id
  LEFT JOIN pessoas pe ON pe.id = p.pessoa_id
  LEFT JOIN LATERAL (
    SELECT pcomp.nome, pcomp.cpf FROM processo_compradores pcomp
    WHERE pcomp.processo_id = p.id
    ORDER BY pcomp.principal DESC NULLS LAST, pcomp.created_at ASC LIMIT 1
  ) pc ON true
  LEFT JOIN LATERAL (
    SELECT x.comissao_empresa, x.valor_maximo_comissao FROM comissoes_padrao x
    WHERE x.banco_id = p.banco_id AND x.empresa_id = p.empresa_id
      AND (x.modalidade = '' OR x.modalidade = p.modalidade::TEXT)
      AND COALESCE(p.valor_financiado, 0) >= x.piso_valor
      AND (x.teto_valor = 0 OR COALESCE(p.valor_financiado, 0) <= x.teto_valor)
    ORDER BY (x.modalidade <> '') DESC, x.piso_valor DESC
    LIMIT 1
  ) cp ON true
  LEFT JOIN LATERAL (
    SELECT r.cgi_valor_limite
    FROM usuarios u2
    JOIN rh_funcionarios f ON f.id = u2.funcionario_id
    LEFT JOIN rh_cargos c ON c.id = f.cargo_id
    JOIN rh_regras_comissao r ON r.id = COALESCE(f.regra_comissao_id, c.regra_comissao_id)
    WHERE u2.id = p.comercial_id
      AND f.empresa_id = p.empresa_id
      AND f.status = 'ativo'
    LIMIT 1
  ) cgi ON true
  WHERE p.empresa_id = p_empresa_id
    AND p.status_emissao = 'emitido'
    AND p.modalidade NOT IN ('Contrato', 'Consorcio')
    AND p.data_emissao IS NOT NULL
    AND EXTRACT(MONTH FROM p.data_emissao) = p_mes
    AND EXTRACT(YEAR  FROM p.data_emissao) = p_ano
  ORDER BY p.data_emissao DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION analise_comissoes_mes(UUID, INTEGER, INTEGER) TO authenticated;

-- ============================================================
-- 4. comissao_apurada_mes — corpo idêntico à migration 299, só o
--    filtro de faixa de valor entra na LATERAL de comissoes_padrao.
--    comissao_financiamento aqui alimenta o subtotal/produção do motor
--    de faixa do RH (igual ao item 1) — sem teto de comissão.
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
    COALESCE(SUM(p.valor_financiado * COALESCE(cp.comissao_comercial, 0) / 100) FILTER (
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
    SELECT x.comissao_comercial FROM comissoes_padrao x
    WHERE x.banco_id = p.banco_id AND x.empresa_id = p.empresa_id
      AND (x.modalidade = '' OR x.modalidade = p.modalidade::TEXT)
      AND COALESCE(p.valor_financiado, 0) >= x.piso_valor
      AND (x.teto_valor = 0 OR COALESCE(p.valor_financiado, 0) <= x.teto_valor)
    ORDER BY (x.modalidade <> '') DESC, x.piso_valor DESC
    LIMIT 1
  ) cp ON true
  WHERE p.empresa_id = p_empresa_id
    AND p.comercial_id = p_comercial_usuario_id
    AND p.status_emissao = 'emitido'
    AND p.modalidade <> 'Consorcio'
    AND p.data_emissao IS NOT NULL
    AND EXTRACT(MONTH FROM p.data_emissao) = p_mes
    AND EXTRACT(YEAR  FROM p.data_emissao) = p_ano;

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
-- 5. contas_a_receber_mes_vivo — corpo idêntico à migration 296, LATERAL
--    de comissoes_padrao ganha filtro de faixa de valor + teto de
--    comissão (valor_previsto é o valor real esperado a receber do
--    banco por esse processo — um cálculo direto por processo, mesmo
--    grupo do item 3).
-- ============================================================
CREATE OR REPLACE FUNCTION contas_a_receber_mes_vivo(
  p_empresa_id UUID,
  p_mes        INTEGER,
  p_ano        INTEGER
)
RETURNS TABLE (
  id                UUID,
  persistido        BOOLEAN,
  processo_id       UUID,
  banco_id          UUID,
  banco_nome        TEXT,
  banco_cor         TEXT,
  cliente_nome      TEXT,
  origem            TEXT,
  valor_previsto    NUMERIC,
  valor_recebido    NUMERIC,
  status            TEXT,
  data_prevista     DATE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.empresa_id = p_empresa_id AND u.ativo = true
  ) THEN
    RAISE EXCEPTION 'Acesso negado: empresa_id inválido para este usuário';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(cr.id, gen_random_uuid()) AS id,
    (cr.id IS NOT NULL)                AS persistido,
    p.id                                AS processo_id,
    p.banco_id                          AS banco_id,
    b.nome                              AS banco_nome,
    b.cor                               AS banco_cor,
    COALESCE(cr.cliente_nome, pc.nome, pe.nome, '') AS cliente_nome,
    COALESCE(cr.origem, 'emissao')      AS origem,
    COALESCE(cr.valor_previsto,
      CASE
        WHEN COALESCE(cp.valor_maximo_comissao, 0) > 0
          THEN LEAST(ROUND(COALESCE(p.valor_financiado, 0) * COALESCE(cp.comissao_empresa, 0) / 100, 2), cp.valor_maximo_comissao)
        ELSE ROUND(COALESCE(p.valor_financiado, 0) * COALESCE(cp.comissao_empresa, 0) / 100, 2)
      END
    ) AS valor_previsto,
    COALESCE(cr.valor_recebido, 0)      AS valor_recebido,
    COALESCE(cr.status::TEXT, 'a_faturar') AS status,
    cr.data_prevista                    AS data_prevista
  FROM processos p
  LEFT JOIN bancos b ON b.id = p.banco_id
  LEFT JOIN pessoas pe ON pe.id = p.pessoa_id
  LEFT JOIN LATERAL (
    SELECT nome FROM processo_compradores WHERE processo_id = p.id
    ORDER BY principal DESC NULLS LAST, created_at ASC LIMIT 1
  ) pc ON true
  LEFT JOIN LATERAL (
    SELECT x.comissao_empresa, x.valor_maximo_comissao FROM comissoes_padrao x
    WHERE x.banco_id = p.banco_id AND x.empresa_id = p.empresa_id
      AND (x.modalidade = '' OR x.modalidade = p.modalidade::TEXT)
      AND COALESCE(p.valor_financiado, 0) >= x.piso_valor
      AND (x.teto_valor = 0 OR COALESCE(p.valor_financiado, 0) <= x.teto_valor)
    ORDER BY (x.modalidade <> '') DESC, x.piso_valor DESC
    LIMIT 1
  ) cp ON true
  LEFT JOIN LATERAL (
    SELECT * FROM financeiro_contas_receber fcr
    WHERE fcr.processo_id = p.id
    ORDER BY fcr.created_at DESC LIMIT 1
  ) cr ON true
  WHERE p.empresa_id = p_empresa_id
    AND p.status_emissao = 'emitido'
    AND p.modalidade NOT IN ('Contrato', 'Consorcio')
    AND p.data_emissao IS NOT NULL
    AND EXTRACT(MONTH FROM p.data_emissao) = p_mes
    AND EXTRACT(YEAR  FROM p.data_emissao) = p_ano

  UNION ALL

  SELECT
    COALESCE(cr.id, gen_random_uuid()),
    (cr.id IS NOT NULL),
    p.id,
    NULL, NULL, NULL,
    COALESCE(cr.cliente_nome, pc.nome, pe.nome, ''),
    COALESCE(cr.origem, 'contrato'),
    COALESCE(cr.valor_previsto, COALESCE(p.valor_contrato, 0)),
    COALESCE(cr.valor_recebido, 0),
    COALESCE(cr.status::TEXT, 'a_faturar'),
    cr.data_prevista
  FROM processos p
  LEFT JOIN pessoas pe ON pe.id = p.pessoa_id
  LEFT JOIN LATERAL (
    SELECT nome FROM processo_compradores WHERE processo_id = p.id
    ORDER BY principal DESC NULLS LAST, created_at ASC LIMIT 1
  ) pc ON true
  LEFT JOIN LATERAL (
    SELECT * FROM financeiro_contas_receber fcr
    WHERE fcr.processo_id = p.id
    ORDER BY fcr.created_at DESC LIMIT 1
  ) cr ON true
  WHERE p.empresa_id = p_empresa_id
    AND p.modalidade = 'Contrato'
    AND p.status_emissao = 'emitido'
    AND p.data_emissao IS NOT NULL
    AND EXTRACT(MONTH FROM p.data_emissao) = p_mes
    AND EXTRACT(YEAR  FROM p.data_emissao) = p_ano;
END;
$$;

-- ============================================================
-- 6. garantir_conta_receber_processo — corpo idêntico à migration 296,
--    a busca de comissoes_padrao ganha filtro de faixa de valor + teto
--    de comissão (mesmo cálculo direto do item 5, só que persistido).
-- ============================================================
CREATE OR REPLACE FUNCTION garantir_conta_receber_processo(
  p_processo_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_empresa_id  UUID;
  v_proc        RECORD;
  v_existing_id UUID;
  v_pct         NUMERIC;
  v_teto_comissao NUMERIC;
  v_origem      TEXT;
  v_valor_base  NUMERIC;
  v_valor_calc  NUMERIC;
  v_fechamento_id UUID;
  v_new_id      UUID;
BEGIN
  SELECT u.empresa_id INTO v_empresa_id FROM usuarios u WHERE u.id = auth.uid() AND u.ativo = true;
  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT id INTO v_existing_id
  FROM financeiro_contas_receber
  WHERE processo_id = p_processo_id AND empresa_id = v_empresa_id
  ORDER BY created_at DESC LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN v_existing_id;
  END IF;

  SELECT
    p.*,
    COALESCE(pc.nome, pe.nome, '') AS cliente_nome
  INTO v_proc
  FROM processos p
  LEFT JOIN pessoas pe ON pe.id = p.pessoa_id
  LEFT JOIN LATERAL (
    SELECT nome FROM processo_compradores WHERE processo_id = p.id
    ORDER BY principal DESC NULLS LAST, created_at ASC LIMIT 1
  ) pc ON true
  WHERE p.id = p_processo_id AND p.empresa_id = v_empresa_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Processo não encontrado ou acesso negado';
  END IF;

  IF v_proc.modalidade = 'Contrato' THEN
    -- Correção deliberada nesta migration: a 296 zerava valor_previsto
    -- aqui (v_valor_calc = v_valor_base * 0 / 100 = 0), inconsistente com
    -- contas_a_receber_mes_vivo (que já usava valor_contrato cheio pra
    -- Contrato). Alinhado ao valor real esperado.
    v_origem := 'contrato';
    v_valor_base := COALESCE(v_proc.valor_contrato, 0);
    v_pct := 0;
    v_valor_calc := v_valor_base;
  ELSE
    v_origem := 'emissao';
    v_valor_base := COALESCE(v_proc.valor_financiado, 0);

    SELECT COALESCE(cp.comissao_empresa, 0), COALESCE(cp.valor_maximo_comissao, 0)
    INTO v_pct, v_teto_comissao
    FROM comissoes_padrao cp
    WHERE cp.empresa_id = v_empresa_id AND cp.banco_id = v_proc.banco_id
      AND (cp.modalidade = '' OR cp.modalidade = v_proc.modalidade::TEXT)
      AND v_valor_base >= cp.piso_valor
      AND (cp.teto_valor = 0 OR v_valor_base <= cp.teto_valor)
    ORDER BY (cp.modalidade <> '') DESC, cp.piso_valor DESC
    LIMIT 1;

    IF NOT FOUND THEN v_pct := 0; v_teto_comissao := 0; END IF;

    v_valor_calc := ROUND(v_valor_base * v_pct / 100, 2);
    IF v_teto_comissao > 0 THEN
      v_valor_calc := LEAST(v_valor_calc, v_teto_comissao);
    END IF;
  END IF;

  SELECT f.id INTO v_fechamento_id
  FROM financeiro_fechamentos f
  WHERE f.empresa_id = v_empresa_id
    AND f.competencia_mes = EXTRACT(MONTH FROM v_proc.data_emissao)
    AND f.competencia_ano = EXTRACT(YEAR FROM v_proc.data_emissao)
  LIMIT 1;

  INSERT INTO financeiro_contas_receber (
    empresa_id, fechamento_id, processo_id, banco_id, cliente_nome, origem,
    valor_base, percentual_previsto, valor_previsto, status
  ) VALUES (
    v_empresa_id, v_fechamento_id, p_processo_id, v_proc.banco_id, v_proc.cliente_nome, v_origem,
    v_valor_base, v_pct, v_valor_calc, 'a_faturar'
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION contas_a_receber_mes_vivo(UUID, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION garantir_conta_receber_processo(UUID) TO authenticated;

-- ============================================================
-- 7. comissao_comercial_calculada(processos) — muda de modelo: deixa de
--    ser a fatia proporcional da comissão mensal (rateio pela faixa do
--    RH) e passa a ser um cálculo direto por processo, igual ao que já
--    era comissao_empresa_calculada: %%comercial da faixa de valor certa
--    × valor_financiado, capado por valor_maximo_comissao. Usada em
--    Negócios > Financiamento (coluna existente) e Análise de Comissões
--    > Financiamento (coluna nova) — as duas mudam juntas.
-- ============================================================
CREATE OR REPLACE FUNCTION comissao_comercial_calculada(processos)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_pct   NUMERIC;
  v_teto  NUMERIC;
  v_valor NUMERIC;
BEGIN
  IF $1.status_emissao IS DISTINCT FROM 'emitido'
     OR $1.comercial_id IS NULL
     OR $1.modalidade = 'Consorcio'
     OR $1.data_emissao IS NULL THEN
    RETURN NULL;
  END IF;

  IF $1.modalidade = 'Contrato' THEN
    RETURN ROUND(COALESCE($1.valor_contrato, 0) + COALESCE($1.valor_assessoria, 0), 2);
  END IF;

  SELECT x.comissao_comercial, x.valor_maximo_comissao
  INTO v_pct, v_teto
  FROM comissoes_padrao x
  WHERE x.banco_id = $1.banco_id AND x.empresa_id = $1.empresa_id
    AND (x.modalidade = '' OR x.modalidade = $1.modalidade::TEXT)
    AND COALESCE($1.valor_financiado, 0) >= x.piso_valor
    AND (x.teto_valor = 0 OR COALESCE($1.valor_financiado, 0) <= x.teto_valor)
  ORDER BY (x.modalidade <> '') DESC, x.piso_valor DESC
  LIMIT 1;

  IF NOT FOUND THEN RETURN NULL; END IF;

  v_valor := ROUND(COALESCE($1.valor_financiado, 0) * COALESCE(v_pct, 0) / 100, 2);
  IF COALESCE(v_teto, 0) > 0 THEN
    v_valor := LEAST(v_valor, v_teto);
  END IF;

  RETURN v_valor;
END;
$$;

-- ============================================================
-- 8. comissao_empresa_calculada(processos) — mesmo cálculo de sempre,
--    só ganha o filtro de faixa de valor e o teto de comissão.
-- ============================================================
CREATE OR REPLACE FUNCTION comissao_empresa_calculada(processos)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_pct  NUMERIC;
  v_teto NUMERIC;
  v_valor NUMERIC;
BEGIN
  IF $1.status_emissao IS DISTINCT FROM 'emitido' OR $1.banco_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT cp.comissao_empresa, cp.valor_maximo_comissao
  INTO v_pct, v_teto
  FROM comissoes_padrao cp
  WHERE cp.empresa_id = $1.empresa_id
    AND cp.banco_id = $1.banco_id
    AND (cp.modalidade = '' OR cp.modalidade = $1.modalidade::TEXT)
    AND COALESCE($1.valor_financiado, 0) >= cp.piso_valor
    AND (cp.teto_valor = 0 OR COALESCE($1.valor_financiado, 0) <= cp.teto_valor)
  ORDER BY (cp.modalidade <> '') DESC, cp.piso_valor DESC
  LIMIT 1;

  IF NOT FOUND THEN RETURN NULL; END IF;

  v_valor := ROUND(COALESCE($1.valor_financiado, 0) * COALESCE(v_pct, 0) / 100, 2);
  IF COALESCE(v_teto, 0) > 0 THEN
    v_valor := LEAST(v_valor, v_teto);
  END IF;

  RETURN v_valor;
END;
$$;
