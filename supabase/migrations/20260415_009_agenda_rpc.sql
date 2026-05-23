-- ============================================================
-- Migration: 20260415_009_agenda_rpc.sql
-- Módulo: Agenda / Tarefas Global — 1 RPC somente leitura
-- ============================================================

CREATE OR REPLACE FUNCTION agenda_tarefas(
  p_empresa_id     UUID,
  p_data_inicio    DATE,
  p_data_fim       DATE,
  p_responsavel_id UUID DEFAULT NULL
)
RETURNS TABLE (
  tarefa_id            UUID,
  tarefa_titulo        TEXT,
  tarefa_vencimento    DATE,
  tarefa_prioridade    TEXT,
  concluida            BOOLEAN,
  concluida_em         TIMESTAMPTZ,
  processo_id          UUID,
  processo_nome_imovel TEXT,
  processo_numero      TEXT,
  responsavel_id       UUID,
  responsavel_nome     TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_perfil TEXT;
  v_uid    UUID := auth.uid();
BEGIN
  SELECT perfil INTO v_perfil
  FROM usuarios
  WHERE id = v_uid AND empresa_id = p_empresa_id AND ativo = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  -- Comercial/operacional só pode ver as próprias tarefas
  IF v_perfil NOT IN ('admin', 'gerente') THEN
    p_responsavel_id := v_uid;
  END IF;

  RETURN QUERY
  SELECT
    t.id                                  AS tarefa_id,
    t.titulo                              AS tarefa_titulo,
    COALESCE(t.vencimento, t.data_vencimento)::DATE AS tarefa_vencimento,
    t.prioridade::TEXT                    AS tarefa_prioridade,
    t.concluida                           AS concluida,
    t.concluida_em                        AS concluida_em,
    p.id                                  AS processo_id,
    COALESCE(p.nome_imovel, '')           AS processo_nome_imovel,
    p.numero_processo                     AS processo_numero,
    COALESCE(u.id, t.criado_por)          AS responsavel_id,
    COALESCE(u.nome, 'Sem responsável')   AS responsavel_nome
  FROM processo_tarefas t
  JOIN processos p ON p.id = t.processo_id
  LEFT JOIN usuarios u ON u.id = t.responsavel_id
  WHERE p.empresa_id = p_empresa_id
    AND (
      COALESCE(t.vencimento, t.data_vencimento) IS NULL
      OR COALESCE(t.vencimento, t.data_vencimento)::DATE BETWEEN p_data_inicio AND p_data_fim
    )
    AND (
      p_responsavel_id IS NULL
      OR t.responsavel_id = p_responsavel_id
    )
  ORDER BY
    t.concluida ASC,
    COALESCE(t.vencimento, t.data_vencimento) ASC NULLS LAST,
    t.prioridade DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION agenda_tarefas(UUID, DATE, DATE, UUID) TO authenticated;
