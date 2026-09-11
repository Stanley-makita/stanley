-- Migration 296: corrige prioridade errada entre pessoa_id e comprador
-- principal na resolução do nome do cliente
--
-- A migration 295 corrigiu o desempate ENTRE compradores empatados, mas
-- não era essa a causa raiz do problema relatado pelo usuário. Dado real
-- confirmado pelo usuário via SELECT direto: no processo
-- 5473fdf3-6491-428e-8fc3-d426075e8262, "Frederico Kiko" está
-- corretamente marcado como principal=true em processo_compradores
-- (criado 2026-09-09 19:52:54), e "Adalto Luiz Barreiros" como
-- principal=false (criado 2026-09-09 14:00:07) — ou seja, a busca por
-- comprador já resolveria "Frederico Kiko" certo, com ou sem a 295.
--
-- A causa raiz real: `processos.pessoa_id` (campo legado, herdado de
-- quando o Lead vira Processo — ver NovoProcessoModal.tsx:776 etc.,
-- nunca resincronizado depois que a lista de compradores é editada)
-- aponta direto pra pessoa "Adalto Luiz Barreiros" nesse processo. Todas
-- as 7 funções da migration 295 fazem
--   COALESCE(pe.nome, pc.nome, '')
-- priorizando esse pessoa_id legado SOBRE o comprador principal
-- corretamente marcado — por isso "Adalto" aparecia mesmo com o
-- desempate já corrigido.
--
-- A Visualização Tabela (VisaoTabela.tsx:117) nunca teve esse problema
-- porque ignora pessoa_id inteiramente: usa só
-- `compradores.find(c=>c.principal) ?? compradores[0]`.
--
-- Fix: inverter a prioridade nas mesmas 7 funções — comprador primeiro,
-- pessoa_id como último fallback (só usado quando o processo não tem
-- NENHUM comprador cadastrado, ex: fluxo de Registro). Mesmo princípio
-- pro par cliente_cpf/cpf em analise_comissoes_mes e
-- analise_comissoes_contratos_mes. Nenhuma outra lógica muda.

-- ============================================================
-- 1. puxar_processos_emitidos
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
-- 2. puxar_contratos
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

    -- NOTA (migration 235): NÃO gera mais comissão direta aqui. O
    -- valor_contrato entra como produção do comercial no fechamento e é
    -- somado à base de cálculo da faixa percentual em gerar_comissoes_a_pagar.

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
-- 3. emissoes_mes_preview
-- ============================================================
CREATE OR REPLACE FUNCTION emissoes_mes_preview(
  p_empresa_id UUID,
  p_mes        INTEGER,
  p_ano        INTEGER
)
RETURNS TABLE (
  id                UUID,
  processo_id       UUID,
  cliente_nome      TEXT,
  banco_id          UUID,
  banco_nome        TEXT,
  banco_cor         TEXT,
  modalidade        TEXT,
  valor_financiado  NUMERIC,
  valor_assessoria  NUMERIC,
  data_emissao      DATE,
  comercial_id      UUID,
  comercial_nome    TEXT,
  operacional_id    UUID,
  operacional_nome  TEXT
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
    gen_random_uuid()          AS id,
    p.id                       AS processo_id,
    COALESCE(pc.nome, pe.nome, '') AS cliente_nome,
    p.banco_id                 AS banco_id,
    b.nome                     AS banco_nome,
    b.cor                      AS banco_cor,
    p.modalidade::TEXT         AS modalidade,
    p.valor_financiado         AS valor_financiado,
    COALESCE(p.valor_assessoria, 0) AS valor_assessoria,
    p.data_emissao             AS data_emissao,
    p.comercial_id             AS comercial_id,
    uc.nome                    AS comercial_nome,
    p.operacional_id           AS operacional_id,
    uo.nome                    AS operacional_nome
  FROM processos p
  LEFT JOIN bancos b ON b.id = p.banco_id
  LEFT JOIN usuarios uc ON uc.id = p.comercial_id
  LEFT JOIN usuarios uo ON uo.id = p.operacional_id
  LEFT JOIN pessoas pe ON pe.id = p.pessoa_id
  LEFT JOIN LATERAL (
    SELECT pcomp.nome FROM processo_compradores pcomp
    WHERE pcomp.processo_id = p.id
    ORDER BY pcomp.principal DESC NULLS LAST, pcomp.created_at ASC LIMIT 1
  ) pc ON true
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
    COALESCE(pc.nome, pe.nome, ''),
    NULL, NULL, NULL,
    'Contrato'::TEXT,
    p.valor_contrato,
    0,
    p.data_emissao,
    p.comercial_id,
    uc.nome,
    p.juridico_id,
    uj.nome
  FROM processos p
  LEFT JOIN usuarios uc ON uc.id = p.comercial_id
  LEFT JOIN usuarios uj ON uj.id = p.juridico_id
  LEFT JOIN pessoas pe ON pe.id = p.pessoa_id
  LEFT JOIN LATERAL (
    SELECT pcomp.nome FROM processo_compradores pcomp
    WHERE pcomp.processo_id = p.id
    ORDER BY pcomp.principal DESC NULLS LAST, pcomp.created_at ASC LIMIT 1
  ) pc ON true
  WHERE p.empresa_id = p_empresa_id
    AND p.modalidade = 'Contrato'
    AND p.status_emissao = 'emitido'
    AND p.data_emissao IS NOT NULL
    AND EXTRACT(MONTH FROM p.data_emissao) = p_mes
    AND EXTRACT(YEAR  FROM p.data_emissao) = p_ano

  ORDER BY data_emissao DESC;
END;
$$;

-- ============================================================
-- 4. contas_a_receber_mes_vivo + garantir_conta_receber_processo
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
    COALESCE(cr.valor_previsto, ROUND(COALESCE(p.valor_financiado, 0) * COALESCE(cp.comissao_empresa, 0) / 100, 2)) AS valor_previsto,
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
    SELECT x.comissao_empresa FROM comissoes_padrao x
    WHERE x.banco_id = p.banco_id AND x.empresa_id = p.empresa_id
      AND (x.modalidade = '' OR x.modalidade = p.modalidade::TEXT)
    ORDER BY (x.modalidade <> '') DESC
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
  v_origem      TEXT;
  v_valor_base  NUMERIC;
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
    v_origem := 'contrato';
    v_valor_base := COALESCE(v_proc.valor_contrato, 0);
    v_pct := 0;
  ELSE
    v_origem := 'emissao';
    v_valor_base := COALESCE(v_proc.valor_financiado, 0);

    SELECT COALESCE(cp.comissao_empresa, 0)
    INTO v_pct
    FROM comissoes_padrao cp
    WHERE cp.empresa_id = v_empresa_id AND cp.banco_id = v_proc.banco_id
      AND (cp.modalidade = '' OR cp.modalidade = v_proc.modalidade::TEXT)
    ORDER BY (cp.modalidade <> '') DESC
    LIMIT 1;

    IF NOT FOUND THEN v_pct := 0; END IF;
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
    v_valor_base, v_pct, ROUND(v_valor_base * v_pct / 100, 2), 'a_faturar'
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION contas_a_receber_mes_vivo(UUID, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION garantir_conta_receber_processo(UUID) TO authenticated;

-- ============================================================
-- 5. analise_comissoes_mes
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
  cgi_manual            NUMERIC,
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
    p.cgi_manual                        AS cgi_manual,
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
-- 6. analise_comissoes_contratos_mes
-- ============================================================
CREATE OR REPLACE FUNCTION analise_comissoes_contratos_mes(
  p_empresa_id UUID,
  p_mes        INTEGER,
  p_ano        INTEGER
)
RETURNS TABLE (
  id                       UUID,
  processo_id              UUID,
  cliente_nome             TEXT,
  cliente_cpf              TEXT,
  comercial_nome           TEXT,
  corretor_nome            TEXT,
  imobiliaria_nome         TEXT,
  prospectado_por          TEXT,
  financiou                BOOLEAN,
  valor_contrato           NUMERIC,
  data_pagamento_contrato  DATE
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
    p.id                            AS id,
    p.id                            AS processo_id,
    COALESCE(pc.nome, pe.nome, '')  AS cliente_nome,
    COALESCE(pc.cpf, pe.cpf, '')    AS cliente_cpf,
    uc.nome                         AS comercial_nome,
    cor.nome                        AS corretor_nome,
    imob.nome                       AS imobiliaria_nome,
    p.prospectado_por               AS prospectado_por,
    p.financiou                     AS financiou,
    p.valor_contrato                AS valor_contrato,
    p.data_pagamento_contrato       AS data_pagamento_contrato
  FROM processos p
  LEFT JOIN usuarios uc ON uc.id = p.comercial_id
  LEFT JOIN pessoas pe ON pe.id = p.pessoa_id
  LEFT JOIN LATERAL (
    SELECT pcomp.nome, pcomp.cpf FROM processo_compradores pcomp
    WHERE pcomp.processo_id = p.id
    ORDER BY pcomp.principal DESC NULLS LAST, pcomp.created_at ASC LIMIT 1
  ) pc ON true
  LEFT JOIN LATERAL (
    SELECT c.nome FROM processo_corretores pcor
    JOIN corretores c ON c.id = pcor.corretor_id
    WHERE pcor.processo_id = p.id
    ORDER BY pcor.principal DESC NULLS LAST, pcor.criado_em ASC LIMIT 1
  ) cor ON true
  LEFT JOIN LATERAL (
    SELECT i.nome FROM processo_imobiliarias pim
    JOIN imobiliarias i ON i.id = pim.imobiliaria_id
    WHERE pim.processo_id = p.id
    ORDER BY pim.criado_em ASC LIMIT 1
  ) imob ON true
  WHERE p.empresa_id = p_empresa_id
    AND p.modalidade = 'Contrato'
    AND p.data_pagamento_contrato IS NOT NULL
    AND EXTRACT(MONTH FROM p.data_pagamento_contrato) = p_mes
    AND EXTRACT(YEAR  FROM p.data_pagamento_contrato) = p_ano
  ORDER BY p.data_pagamento_contrato DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION analise_comissoes_contratos_mes(UUID, INTEGER, INTEGER) TO authenticated;
