-- Migration 298: regra especial de comissão pra CGI acima de um valor
--
-- Regra de negócio confirmada com o usuário: quando um funcionário
-- comercial tem uma regra do tipo 'percentual_faixa_producao_mensal' e
-- essa regra tem um limite de CGI configurado, todo processo modalidade
-- CGI com valor_financiado ACIMA desse limite:
--   1. Sai da soma que decide em qual faixa de produção mensal o
--      comercial se enquadra (não conta como "produção normal").
--   2. Tem sua própria comissão calculada à parte: um percentual fixo
--      sobre o valor financiado DESSE processo (ex.: 1%).
--   3. Essa comissão é somada por fora do valor da faixa (já com
--      piso/teto aplicados) — não entra no piso/teto da faixa.
--
-- Exemplo confirmado: comercial fechou R$1.500.000 em SBPE (< R$3mi, faixa
-- de 20%) + 1 CGI de R$260.000 (> limite de R$250mi). Comissão do mês =
-- 20% × R$1.500.000 (produção normal, sem o CGI) + 1% × R$260.000 (CGI
-- especial) — não 20% sobre R$1.760.000.
--
-- Campos novos em rh_regras_comissao (nulos = regra não tem exceção de
-- CGI, comportamento idêntico a antes desta migration):
--   cgi_valor_limite      NUMERIC — a partir de quanto (exclusive) o
--                                   processo CGI vira "especial".
--   cgi_percentual_acima  NUMERIC — % aplicado direto sobre o valor
--                                   financiado desses processos especiais.
--
-- Funções atualizadas: calcular_producao_comercial_mes, gerar_comissoes_
-- a_pagar (ambas precisam saber a regra do comercial ANTES de agregar a
-- produção, pra excluir os CGIs especiais da soma) e comissao_comercial_
-- calculada (a coluna computada usada em Negócios > Financiamento —
-- processos CGI especiais mostram o 1% direto, não mais uma fatia
-- proporcional da comissão total do mês).
--
-- Simplificação assumida: a regra fala em "valor do financiamento" — só o
-- valor financiado do CGI sai da produção normal. Se esse mesmo processo
-- também tiver valor_assessoria, essa parte continua contando na produção
-- normal (não é excluída) — o total pago ao comercial no mês fecha certo
-- de qualquer forma (a assessoria some dentro do rateio dos OUTROS
-- processos), só a exibição por linha desse processo específico em
-- Negócios > Financiamento não itemiza separadamente a fatia de
-- assessoria dele (mostra só o 1% do financiamento). Sem casos reais de
-- CGI com assessoria até agora — revisitar se aparecer um.
--
-- Global constraint deste projeto (reforçada pela migration 248): nunca
-- ler um campo de uma variável RECORD fora do bloco que a populou com
-- sucesso — PL/pgSQL não garante short-circuit em AND, então até um
-- "FOUND AND record.campo" pode crashar se o SELECT INTO nunca rodou.
-- Por isso os campos de v_regra são sempre extraídos pra variáveis
-- simples (v_tipo_calculo, v_cgi_valor_limite, v_cgi_percentual_acima)
-- dentro do próprio IF FOUND, e usados só como essas variáveis daí em
-- diante.

ALTER TABLE rh_regras_comissao
  ADD COLUMN IF NOT EXISTS cgi_valor_limite NUMERIC,
  ADD COLUMN IF NOT EXISTS cgi_percentual_acima NUMERIC;

-- Os dois campos são preenchidos juntos ou nenhum — evita configuração
-- parcial (ex.: limite setado sem percentual) que faria o SUM(valor *
-- percentual_nulo) descartar silenciosamente a comissão especial em vez
-- de dar erro.
ALTER TABLE rh_regras_comissao
  DROP CONSTRAINT IF EXISTS rh_regras_comissao_cgi_ambos_ou_nenhum;
ALTER TABLE rh_regras_comissao
  ADD CONSTRAINT rh_regras_comissao_cgi_ambos_ou_nenhum
  CHECK ((cgi_valor_limite IS NULL) = (cgi_percentual_acima IS NULL));

-- ============================================================
-- 1. calcular_producao_comercial_mes — RETURNS TABLE ganha 3 colunas
--    novas (comissao_faixa, cgi_valor_limite, cgi_percentual_acima), o
--    que muda o tipo de retorno da função — CREATE OR REPLACE sozinho
--    não permite isso ("cannot change return type of existing
--    function"), precisa DROP antes (mesmo padrão já usado neste
--    projeto em migrations anteriores que mudaram RETURNS TABLE).
--    Expor os 2 campos de CGI aqui evita que comissao_comercial_calculada
--    precise fazer sua própria consulta a rh_regras_comissao — essa
--    função não é SECURITY DEFINER, então uma consulta própria ficaria
--    sujeita a RLS e devolveria vazio pra quem não tem rh.ver, calculando
--    errado o valor daquela linha. Chamando esta função (que já é
--    SECURITY DEFINER) e lendo os campos do resultado, o valor é sempre
--    consistente independente de quem está olhando a tela.
-- ============================================================
DROP FUNCTION IF EXISTS calcular_producao_comercial_mes(UUID, UUID, INTEGER, INTEGER);

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
             ), 0)
  INTO v_producao_financiamento, v_producao_contrato, v_producao_assessoria, v_producao_cgi_especial
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
-- 2. gerar_comissoes_a_pagar — bloco COMERCIAL reestruturado: antes
--    agregava todos os comerciais numa única query com GROUP BY; agora
--    precisa saber a regra (e o limite de CGI) de CADA comercial ANTES
--    de agregar a produção dele, então passa a ser uma query de produção
--    por comercial dentro do loop (mesmo padrão de
--    calcular_producao_comercial_mes). Bloco OPERACIONAL + PARCEIRO
--    inalterado.
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
  -- pra saber se (e a partir de quanto) excluir CGIs especiais da
  -- produção que decide a faixa.
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
               ), 0)
    INTO v_producao_financiamento, v_producao_contrato, v_producao_assessoria, v_producao_cgi_especial
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
-- 3. comissao_comercial_calculada(processos) — processo CGI especial
--    mostra o percentual direto sobre o valor financiado; os demais
--    continuam com a fatia proporcional, agora calculada sobre
--    comissao_faixa (só a parte por faixa, sem o CGI especial de outros
--    processos do mesmo comercial/mês).
--
--    Importante: esta função NÃO é SECURITY DEFINER (nunca foi), então
--    uma consulta própria a rh_regras_comissao/rh_funcionarios ficaria
--    sujeita a RLS e devolveria vazio pra um usuário sem a permissão
--    rh.ver — calculando um valor errado (não simplesmente desatualizado)
--    pra quem está vendo a tela. Por isso os campos de CGI vêm de
--    calcular_producao_comercial_mes (que já é SECURITY DEFINER e já
--    precisa ser chamada aqui mesmo pra pegar producao_total/comissao_
--    faixa) em vez de uma consulta separada.
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

  SELECT * INTO v_prod
  FROM calcular_producao_comercial_mes(
    $1.empresa_id, $1.comercial_id,
    EXTRACT(MONTH FROM $1.data_emissao)::INTEGER,
    EXTRACT(YEAR  FROM $1.data_emissao)::INTEGER
  );

  IF $1.modalidade = 'CGI'
     AND v_prod.cgi_valor_limite IS NOT NULL AND v_prod.cgi_percentual_acima IS NOT NULL
     AND COALESCE($1.valor_financiado, 0) > v_prod.cgi_valor_limite THEN
    RETURN ROUND($1.valor_financiado * v_prod.cgi_percentual_acima / 100, 2);
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

  IF v_prod.producao_total IS NULL OR v_prod.producao_total = 0 THEN
    RETURN 0;
  END IF;

  RETURN ROUND(v_prod.comissao_faixa * v_contribuicao / v_prod.producao_total, 2);
END;
$$;

-- ============================================================
-- 4. comissao_apurada_mes — corpo idêntico à migration 294, só exclui
--    do total de cgi_manual os processos CGI que já caem na regra
--    especial automática (senão o desconto acontece duas vezes: uma
--    vez automaticamente dentro de comissao_total, via a exclusão da
--    faixa + soma do 1% em calcular_producao_comercial_mes, e de novo
--    manualmente aqui). cgi_manual continua funcionando normalmente
--    pra comerciais/processos SEM regra especial de CGI configurada.
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
  cgi_manual_total             NUMERIC,
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
  v_cgi_manual_total       NUMERIC;
  v_producao               RECORD;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.empresa_id = p_empresa_id AND u.ativo = true
  ) THEN
    RAISE EXCEPTION 'Acesso negado: empresa_id inválido para este usuário';
  END IF;

  -- Chamada primeiro (não é uma mudança de ordem por acaso): precisa do
  -- cgi_valor_limite da regra pra decidir quais processos CGI excluir da
  -- soma de cgi_manual logo abaixo. Sempre devolve exatamente 1 linha,
  -- então v_producao.cgi_valor_limite é seguro de ler mesmo sem
  -- funcionário/regra configurada (fica NULL, exclui nada — igual antes).
  SELECT * INTO v_producao
  FROM calcular_producao_comercial_mes(p_empresa_id, p_comercial_usuario_id, p_mes, p_ano);

  SELECT
    COUNT(*) FILTER (WHERE p.modalidade NOT IN ('Contrato', 'Consorcio')),
    COUNT(*) FILTER (WHERE p.modalidade = 'Contrato'),
    COALESCE(SUM(p.valor_financiado) FILTER (WHERE p.modalidade NOT IN ('Contrato', 'Consorcio')), 0),
    COALESCE(SUM(p.valor_financiado * COALESCE(cp.comissao_comercial, 0) / 100)
             FILTER (WHERE p.modalidade NOT IN ('Contrato', 'Consorcio')), 0),
    COALESCE(SUM(p.valor_assessoria), 0),
    COALESCE(SUM(p.valor_contrato) FILTER (WHERE p.modalidade = 'Contrato'), 0),
    COALESCE(SUM(p.cgi_manual) FILTER (
      WHERE p.modalidade NOT IN ('Contrato', 'Consorcio')
        AND NOT (
          p.modalidade = 'CGI' AND v_producao.cgi_valor_limite IS NOT NULL
          AND p.valor_financiado > v_producao.cgi_valor_limite
        )
    ), 0)
  INTO
    v_qtd_financiamento,
    v_qtd_contratos,
    v_valor_financiamento,
    v_comissao_financiamento,
    v_valor_assessoria,
    v_valor_contratos,
    v_cgi_manual_total
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

  RETURN QUERY SELECT
    v_qtd_financiamento,
    v_qtd_contratos,
    v_valor_financiamento,
    v_comissao_financiamento,
    v_valor_assessoria,
    v_valor_contratos,
    v_producao.producao_total,
    v_producao.pct_aplicado,
    v_producao.comissao_total,
    v_cgi_manual_total,
    v_producao.comissao_total - v_cgi_manual_total;
END;
$$;

GRANT EXECUTE ON FUNCTION comissao_apurada_mes(UUID, UUID, INTEGER, INTEGER) TO authenticated;
