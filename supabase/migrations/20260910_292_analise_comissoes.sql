-- Aba Financeiro > Análise de Comissões: uma linha por processo emitido no
-- mês (financiamento, mesmo filtro de emissoes_mes_preview), com o
-- percentual/valor de comissão cheia da empresa (mesma fonte de "A
-- Receber") e um ajuste manual "CGI 1%" que o usuário pode informar por
-- processo — comissão final = comissão cheia - cgi_manual.

ALTER TABLE processos ADD COLUMN IF NOT EXISTS cgi_manual NUMERIC(14,2);

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
    COALESCE(pe.nome, pc.nome, '')      AS cliente_nome,
    COALESCE(pe.cpf, pc.cpf, '')        AS cliente_cpf,
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
  ORDER BY p.data_emissao DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION analise_comissoes_mes(UUID, INTEGER, INTEGER) TO authenticated;
