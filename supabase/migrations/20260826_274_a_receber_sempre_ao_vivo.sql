-- Migration 274: A Receber sempre ao vivo, editável a qualquer momento
--
-- Antes: A Receber só ficava editável (NF/Recebimento) depois que o
-- Fechamento do mês era aprovado — porque as linhas do preview ao vivo
-- tinham id descartável (gen_random_uuid() novo a cada consulta), sem
-- registro permanente pra pendurar NF/Recebimento. Efeito colateral:
-- "Aprovar Fechamento" amarrava duas coisas que não deveriam estar
-- juntas — travar o cálculo de comissão (correto, contábil) E liberar
-- edição de NF/Recebimento (devia ser possível a qualquer momento,
-- inclusive antes de aprovar).
--
-- Esta migration desacopla: A Receber passa a ser sempre uma view ao
-- vivo (contas_a_receber_mes_vivo), que mostra todo processo emitido no
-- mês — usando o registro PERSISTIDO em financeiro_contas_receber quando
-- já existe (de qualquer fechamento, aprovado ou não), ou um valor
-- calculado ao vivo quando ainda não existe registro nenhum pro
-- processo. garantir_conta_receber_processo cria esse registro sob
-- demanda, na hora que o usuário tenta lançar a primeira NF/Recebimento
-- de um processo que ainda não tinha linha persistida.

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
    COALESCE(cr.cliente_nome, pe.nome, pc.nome, '') AS cliente_nome,
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
    ORDER BY principal DESC NULLS LAST LIMIT 1
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
    COALESCE(cr.cliente_nome, pe.nome, pc.nome, ''),
    COALESCE(cr.origem, 'contrato'),
    COALESCE(cr.valor_previsto, COALESCE(p.valor_contrato, 0)),
    COALESCE(cr.valor_recebido, 0),
    COALESCE(cr.status::TEXT, 'a_faturar'),
    cr.data_prevista
  FROM processos p
  LEFT JOIN pessoas pe ON pe.id = p.pessoa_id
  LEFT JOIN LATERAL (
    SELECT nome FROM processo_compradores WHERE processo_id = p.id
    ORDER BY principal DESC NULLS LAST LIMIT 1
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

-- Cria (se ainda não existir) o registro persistido de contas a receber
-- pra um processo, e retorna o id — chamado sob demanda quando o usuário
-- lança a primeira NF/Recebimento de um processo que ainda só existia
-- como linha calculada ao vivo.
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
    COALESCE(pe.nome, pc.nome, '') AS cliente_nome
  INTO v_proc
  FROM processos p
  LEFT JOIN pessoas pe ON pe.id = p.pessoa_id
  LEFT JOIN LATERAL (
    SELECT nome FROM processo_compradores WHERE processo_id = p.id
    ORDER BY principal DESC NULLS LAST LIMIT 1
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
