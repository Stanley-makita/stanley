-- Aba Financeiro > Análise de Comissões > Contratos: demonstrativo mensal
-- de contratos particulares pagos. O gatilho de mês é
-- data_pagamento_contrato (quando o pagamento foi confirmado na tela do
-- processo), não a data de criação/emissão — um contrato só aparece na
-- aba depois de alguém confirmar o pagamento.

ALTER TABLE processos
  ADD COLUMN IF NOT EXISTS financiou BOOLEAN,
  ADD COLUMN IF NOT EXISTS prospectado_por TEXT CHECK (prospectado_por IN ('fontinhas', 'direto')),
  ADD COLUMN IF NOT EXISTS data_pagamento_contrato DATE;

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
    COALESCE(pe.nome, pc.nome, '')  AS cliente_nome,
    COALESCE(pe.cpf, pc.cpf, '')    AS cliente_cpf,
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
    ORDER BY pcomp.principal DESC NULLS LAST LIMIT 1
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
