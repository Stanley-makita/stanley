-- Migration 299: mostra Comissão Comercial por processo e vira o CGI 1%
-- de dedução manual pra linha aditiva automática
--
-- Duas mudanças de exibição confirmadas com o usuário (planilha de
-- referência conferida — bate exatamente com os números reais):
--
-- 1. Financeiro > Análise de Comissões > Financiamento (analise_comissoes_
--    mes): a tabela só mostrava a comissão da EMPRESA por processo (via
--    comissoes_padrao.comissao_empresa). Passa a mostrar também a
--    comissão do COMERCIAL por processo (comissao_comercial_calculada,
--    que já embute o 1% do CGI especial quando aplicável — migration
--    298) e um flag cgi_especial pra a UI destacar essa linha em negrito.
--    O campo cgi_manual (dedução manual, editável na tela) sai da tabela
--    — não é mais usado, a regra automática (298) já resolve isso.
--
-- 2. Financeiro > Análise de Comissões > Comissão Apurada
--    (comissao_apurada_mes): antes calculava
--      comissao_apurada = comissao_total (faixa + CGI já embutido) − cgi_manual
--    ou seja, o valor do CGI aparecia escondido dentro de "Cálculo de
--    Comissões" e o campo manual subtraía de novo por cima (double-
--    deduction, corrigido às pressas na migration 298). Agora:
--      - valor_financiamento/comissao_financiamento (cards) EXCLUEM os
--        processos CGI especiais — só mostram a "produção de regra
--        geral", como o usuário pediu.
--      - "Cálculo de Comissões" = só a parte por faixa (comissao_faixa).
--      - "CGI 1%" = o valor automático da regra especial, exposto como
--        soma (cgi_1_total = comissao_total − comissao_faixa), não mais
--        editável.
--      - comissao_apurada = Cálculo de Comissões + CGI 1% (soma —
--        antes era subtração do manual). Como comissao_total já é
--        faixa + cgi por construção (migration 298), o valor final não
--        muda de fórmula real, só a forma como os componentes são
--        expostos pra bater com o que a planilha de referência mostra.
--
-- processos.cgi_manual continua existindo na tabela (não foi removida),
-- só não é mais lida por nenhuma função — dado histórico, sem uso.

-- ============================================================
-- 1. analise_comissoes_mes — troca cgi_manual por comissao_comercial +
--    cgi_especial. Muda o RETURNS TABLE, precisa DROP antes.
-- ============================================================
DROP FUNCTION IF EXISTS analise_comissoes_mes(UUID, INTEGER, INTEGER);

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
    ROUND(COALESCE(p.valor_financiado, 0) * COALESCE(cp.comissao_empresa, 0) / 100, 2) AS comissao,
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
    SELECT x.comissao_empresa FROM comissoes_padrao x
    WHERE x.banco_id = p.banco_id AND x.empresa_id = p.empresa_id
      AND (x.modalidade = '' OR x.modalidade = p.modalidade::TEXT)
    ORDER BY (x.modalidade <> '') DESC
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
-- 2. comissao_apurada_mes — cgi_manual_total vira cgi_1_total (soma
--    automática, não mais dedução manual). Muda o RETURNS TABLE (nome
--    da coluna), precisa DROP antes.
-- ============================================================
DROP FUNCTION IF EXISTS comissao_apurada_mes(UUID, UUID, INTEGER, INTEGER);

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

  -- Chamada primeiro: precisa de comissao_faixa/comissao_total/
  -- cgi_valor_limite antes de agregar os processos. Sempre devolve
  -- exatamente 1 linha (ver migration 298), seguro de ler os campos.
  SELECT * INTO v_producao
  FROM calcular_producao_comercial_mes(p_empresa_id, p_comercial_usuario_id, p_mes, p_ano);

  v_cgi_1_total := v_producao.comissao_total - v_producao.comissao_faixa;

  SELECT
    -- Contagem de financiamentos também exclui o CGI especial — o card
    -- "Financiamentos (emitidos no mês)" fica ao lado de "Valor
    -- Financiamento" na tela, e os dois precisam descrever a mesma
    -- população (regra geral), senão a contagem parece não bater com o
    -- valor mostrado ao lado.
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
    -- valor_assessoria NÃO exclui o CGI especial — mesma simplificação já
    -- assumida em calcular_producao_comercial_mes (migration 298): a
    -- regra fala em "valor do financiamento", a assessoria de um CGI
    -- especial (se houver) continua contando como produção normal.
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
    v_producao.comissao_faixa,
    v_cgi_1_total,
    v_producao.comissao_total;
END;
$$;

GRANT EXECUTE ON FUNCTION comissao_apurada_mes(UUID, UUID, INTEGER, INTEGER) TO authenticated;
