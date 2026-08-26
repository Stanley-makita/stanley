-- Migration 271: Preview ao vivo da aba Financeiro > Emissões
--
-- A aba Emissões (VisaoEmissoes/useFechamentoProcessos) só lia
-- financeiro_fechamento_processos, uma cópia gravada uma única vez quando
-- alguém aprova o Fechamento do mês (via puxar_processos_emitidos +
-- puxar_contratos, chamadas em preparar_fechamento). Resultado: navegar
-- para um mês sem fechamento aprovado mostrava a tela vazia, e um processo
-- que virasse "Emitido" depois da aprovação nunca aparecia lá — mesmo
-- estando com status_emissao='emitido' e visível na tela de Processos.
--
-- Segue o mesmo padrão já usado em contas_a_receber_mes_preview (migration
-- 239, ver AbaAReceber.tsx): antes do fechamento ser aprovado/pago/travado,
-- a aba mostra este preview ao vivo, direto de `processos`, com os MESMOS
-- filtros de puxar_processos_emitidos e puxar_contratos. Depois de
-- aprovado/pago/travado, a tela volta a usar o snapshot gravado — que é
-- a mesma base usada por gerar_comissoes_a_pagar, preservando o histórico
-- contábil daquele fechamento.

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
    SELECT 1 FROM usuarios WHERE id = auth.uid() AND empresa_id = p_empresa_id AND ativo = true
  ) THEN
    RAISE EXCEPTION 'Acesso negado: empresa_id inválido para este usuário';
  END IF;

  RETURN QUERY
  -- Financiamento/CGI/etc — mesmo filtro de puxar_processos_emitidos
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

  -- Contratos — mesmo filtro de puxar_contratos (operacional exibido = jurídico)
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

GRANT EXECUTE ON FUNCTION emissoes_mes_preview(UUID, INTEGER, INTEGER) TO authenticated;
