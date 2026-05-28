-- Migration 059: recriar agenda_tarefas com suporte a data_prazo e fonte/lead_id
-- Corrige o caso em que migration 058 pode não ter atualizado a função devido a
-- limitação do PostgreSQL com ALTER TYPE ADD VALUE em transações.

DROP FUNCTION IF EXISTS agenda_tarefas(uuid, date, date, uuid);

CREATE OR REPLACE FUNCTION agenda_tarefas(
  p_empresa_id     uuid,
  p_data_inicio    date,
  p_data_fim       date,
  p_responsavel_id uuid DEFAULT NULL
)
RETURNS TABLE (
  tarefa_id            uuid,
  tarefa_titulo        text,
  tarefa_vencimento    date,
  tarefa_prioridade    text,
  concluida            boolean,
  concluida_em         timestamptz,
  processo_id          uuid,
  processo_nome_imovel text,
  processo_numero      text,
  responsavel_id       uuid,
  responsavel_nome     text,
  fonte                text,
  lead_id              uuid
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_perfil text;
BEGIN
  SELECT perfil INTO v_perfil
  FROM usuarios
  WHERE id = auth.uid() AND empresa_id = p_empresa_id AND ativo = true;

  -- Não-admin/gerente/gestor só veem suas próprias tarefas
  IF v_perfil NOT IN ('admin', 'gerente', 'gestor') THEN
    p_responsavel_id := auth.uid();
  END IF;

  RETURN QUERY

  -- Tarefas de processos
  SELECT
    pt.id,
    pt.titulo,
    COALESCE(pt.data_prazo, pt.vencimento, pt.data_vencimento)::date,
    pt.prioridade::text,
    pt.concluida,
    pt.concluida_em,
    pt.processo_id,
    COALESCE(p.nome_imovel, '')::text,
    COALESCE(p.numero_processo, '')::text,
    COALESCE(pt.responsavel_id, pt.criado_por),
    COALESCE(u.nome, 'Sem responsável')::text,
    'processo'::text,
    NULL::uuid
  FROM processo_tarefas pt
  JOIN processos p ON p.id = pt.processo_id
  LEFT JOIN usuarios u ON u.id = pt.responsavel_id
  WHERE pt.empresa_id = p_empresa_id
    AND (pt.deleted_at IS NULL OR pt.deleted_at > now())
    AND (
      p_responsavel_id IS NULL
      OR pt.responsavel_id = p_responsavel_id
      OR pt.criado_por = p_responsavel_id
    )
    AND (
      COALESCE(pt.data_prazo, pt.vencimento, pt.data_vencimento) IS NULL
      OR COALESCE(pt.data_prazo, pt.vencimento, pt.data_vencimento)::date
         BETWEEN p_data_inicio AND p_data_fim
    )

  UNION ALL

  -- Tarefas de leads
  SELECT
    lt.id,
    lt.titulo,
    lt.data_prazo::date,
    lt.prioridade::text,
    lt.concluida,
    lt.concluida_em,
    NULL::uuid,
    COALESCE(l.nome, 'Lead')::text,
    'Lead'::text,
    COALESCE(lt.responsavel_id, lt.criado_por),
    COALESCE(u.nome, 'Sem responsável')::text,
    'lead'::text,
    lt.lead_id
  FROM lead_tarefas lt
  JOIN leads l ON l.id = lt.lead_id
  LEFT JOIN usuarios u ON u.id = lt.responsavel_id
  WHERE lt.empresa_id = p_empresa_id
    AND (lt.deleted_at IS NULL OR lt.deleted_at > now())
    AND (
      p_responsavel_id IS NULL
      OR lt.responsavel_id = p_responsavel_id
      OR lt.criado_por = p_responsavel_id
    )
    AND (
      lt.data_prazo IS NULL
      OR lt.data_prazo::date BETWEEN p_data_inicio AND p_data_fim
    )

  ORDER BY tarefa_vencimento ASC NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION agenda_tarefas(uuid, date, date, uuid) TO authenticated;
