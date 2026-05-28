-- Migration: Unificação do sistema de tarefas
-- Enriquece processo_tarefas e atualiza agenda_tarefas RPC para incluir lead_tarefas

-- 1. Enriquecer processo_tarefas com campos ausentes
ALTER TABLE processo_tarefas
  ADD COLUMN IF NOT EXISTS data_prazo       DATE,
  ADD COLUMN IF NOT EXISTS status          TEXT DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS descricao       TEXT,
  ADD COLUMN IF NOT EXISTS categoria       TEXT DEFAULT 'geral',
  ADD COLUMN IF NOT EXISTS horario_inicio  TIME,
  ADD COLUMN IF NOT EXISTS horario_termino TIME,
  ADD COLUMN IF NOT EXISTS deleted_at      TIMESTAMPTZ;

-- 2. Adicionar 'urgente' ao enum de prioridade
ALTER TYPE prioridade_tarefa ADD VALUE IF NOT EXISTS 'urgente';

-- 3. Recriar agenda_tarefas para incluir lead_tarefas (UNION ALL)
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
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_perfil text;
BEGIN
  SELECT perfil INTO v_perfil FROM usuarios WHERE id = auth.uid();

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
    AND pt.deleted_at IS NULL
    AND (
      (v_perfil IN ('admin','gerente','gestor'))
      OR (pt.responsavel_id = auth.uid())
      OR (pt.criado_por = auth.uid())
    )
    AND (p_responsavel_id IS NULL OR pt.responsavel_id = p_responsavel_id OR pt.criado_por = p_responsavel_id)
    AND (
      COALESCE(pt.data_prazo, pt.vencimento, pt.data_vencimento) IS NULL
      OR COALESCE(pt.data_prazo, pt.vencimento, pt.data_vencimento)::date BETWEEN p_data_inicio AND p_data_fim
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
    AND lt.deleted_at IS NULL
    AND (
      (v_perfil IN ('admin','gerente','gestor'))
      OR (lt.responsavel_id = auth.uid())
      OR (lt.criado_por = auth.uid())
    )
    AND (p_responsavel_id IS NULL OR lt.responsavel_id = p_responsavel_id OR lt.criado_por = p_responsavel_id)
    AND (
      lt.data_prazo IS NULL
      OR lt.data_prazo::date BETWEEN p_data_inicio AND p_data_fim
    )

  ORDER BY tarefa_vencimento ASC NULLS LAST;
END;
$$;
