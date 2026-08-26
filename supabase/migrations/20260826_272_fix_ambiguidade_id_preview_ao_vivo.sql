-- Migration 272: Fix — "column reference \"id\" is ambiguous" em
-- emissoes_mes_preview e contas_a_receber_mes_preview
--
-- Erro real (42702, mesma classe já documentada na migration 239): como
-- as duas funções têm RETURNS TABLE(id UUID, ...), o nome "id" também vira
-- um parâmetro/variável PL/pgSQL dentro do corpo da função. O check de
-- permissão `WHERE id = auth.uid()` usava "id" sem qualificar a tabela —
-- ambíguo entre usuarios.id e o parâmetro de saída "id". Resultado: as
-- duas RPCs falhavam com 400 em toda chamada, deixando a aba Emissões
-- (preview ao vivo, migration 271) e a aba A Receber (preview ao vivo,
-- migration 239) sempre vazias, mesmo com processos emitidos no mês —
-- sem nenhum erro visível na tela, porque o hook trata `error` lançando,
-- e o React Query engole silenciosamente até o retry esgotar.
--
-- Fix: qualificar com o alias da tabela, igual a migration 239 já tinha
-- feito para calcular_producao_comercial_mes.

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
    COALESCE(pe.nome, pc.nome, '') AS cliente_nome,
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
    ORDER BY pcomp.principal DESC NULLS LAST LIMIT 1
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
    COALESCE(pe.nome, pc.nome, ''),
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
    ORDER BY pcomp.principal DESC NULLS LAST LIMIT 1
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
    SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.empresa_id = p_empresa_id AND u.ativo = true
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
    SELECT pcomp.nome FROM processo_compradores pcomp
    WHERE pcomp.processo_id = p.id
    ORDER BY pcomp.principal DESC NULLS LAST LIMIT 1
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
    SELECT pcomp.nome FROM processo_compradores pcomp
    WHERE pcomp.processo_id = p.id
    ORDER BY pcomp.principal DESC NULLS LAST LIMIT 1
  ) pc ON true
  WHERE p.empresa_id = p_empresa_id
    AND p.modalidade = 'Contrato'
    AND p.status_emissao = 'emitido'
    AND p.data_emissao IS NOT NULL
    AND EXTRACT(MONTH FROM p.data_emissao) = p_mes
    AND EXTRACT(YEAR  FROM p.data_emissao) = p_ano;
END;
$$;

GRANT EXECUTE ON FUNCTION emissoes_mes_preview(UUID, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION contas_a_receber_mes_preview(UUID, INTEGER, INTEGER) TO authenticated;
