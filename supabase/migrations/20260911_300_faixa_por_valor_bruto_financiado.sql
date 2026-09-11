-- Migration 300: a faixa de comissão é escolhida pelo valor BRUTO
-- financiado, não pelo subtotal ponderado
--
-- Confirmado com o usuário com exemplo numérico real: a faixa de
-- produção mensal (20%/25%/30%/35%) é escolhida pela SOMA BRUTA do
-- valor financiado (sem aplicar %% do banco, sem contrato, sem
-- assessoria) — não pelo "subtotal" (comissão-base ponderada + contrato
-- + assessoria) que eu vinha usando como chave da faixa.
--
-- O percentual da faixa escolhida continua sendo multiplicado pelo
-- SUBTOTAL PONDERADO (isso já estava certo) — só a CHAVE de qual faixa
-- escolher que estava errada.
--
-- Exemplo confirmado: Bruno financiou processos cuja soma das
-- comissões-base (valor_financiado × %%comercial do banco) deu
-- R$145.000, + R$1.000 de assessoria + R$5.000 de contratos = subtotal
-- de R$151.000. O valor BRUTO financiado dele (soma de valor_financiado,
-- sem aplicar %%) passou de R$3.000.000 → faixa de 25%. Comissão =
-- 25% × R$151.000 = R$37.750 — não 25% (ou outra faixa) calculado sobre
-- os R$151.000 usados como se fossem a própria chave.
--
-- O CGI especial (migration 298) continua excluído tanto do valor bruto
-- quanto do subtotal ponderado — a exclusão é a mesma predicate de antes,
-- só aplicada agora também à nova soma bruta.
--
-- relatorio_equipe (migration 248) tem a mesma lógica de faixa duplicada
-- e o mesmo problema, mas não é chamada por nenhuma tela hoje (órfã) —
-- não corrigida aqui, sem uso.
--
-- Novo tipo de conferência: com a faixa agora escolhida pelo valor bruto
-- financiado (antes incluía contrato/assessoria na chave), um comercial
-- só com contrato/assessoria e nenhum financiamento no mês pode ficar
-- sem nenhuma faixa aplicável — sem esse alerta ele sumiria do
-- fechamento sem aviso. ALTER TYPE precisa rodar antes do CREATE OR
-- REPLACE que usa esse valor (não pode ser a mesma transação que já
-- consome o valor novo em versões antigas do Postgres, mas como aqui só
-- estamos GRAVANDO a definição da função — o INSERT que de fato usa o
-- valor só roda depois, quando gerar_comissoes_a_pagar for chamada —,
-- é seguro).
ALTER TYPE fin_tipo_conferencia ADD VALUE IF NOT EXISTS 'processo_sem_faixa_comissao';

-- ============================================================
-- 1. calcular_producao_comercial_mes — mesmo corpo da migration 298, só
--    troca a chave da faixa de v_producao_total pro novo
--    v_valor_financiado_bruto. RETURNS TABLE não muda, CREATE OR REPLACE
--    direto (sem DROP).
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

  -- Produção normal exclui CGI especial (acima do limite da regra); a
  -- comissão desses processos é apurada à parte, em v_producao_cgi_especial.
  -- v_valor_financiado_bruto é a soma SEM aplicar %% do banco — é ela
  -- (não v_producao_total) que decide em qual faixa o comercial cai.
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
-- 2. gerar_comissoes_a_pagar — mesmo corpo da migration 298, só troca a
--    chave da faixa (bloco COMERCIAL) de v_producao_total pro novo
--    v_valor_financiado_bruto. RETURNS INTEGER não muda, CREATE OR
--    REPLACE direto.
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
  -- COMERCIAL: um comercial por vez — resolve a regra dele primeiro,
  -- pra saber se (e a partir de quanto) excluir CGIs especiais, e usa o
  -- valor BRUTO financiado (não o subtotal ponderado) como chave da faixa.
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
      ORDER BY (x.modalidade <> '') DESC
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

    -- Agora que a faixa é escolhida pelo valor bruto financiado (não mais
    -- pelo subtotal, que sempre incluía contrato/assessoria), um
    -- comercial com produção só de contrato/assessoria e nenhum
    -- financiamento no mês pode ficar sem nenhuma faixa aplicável (se a
    -- menor faixa da regra não começar em 0) — sem esse alerta, ele
    -- simplesmente sumiria do fechamento sem aviso nenhum.
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
