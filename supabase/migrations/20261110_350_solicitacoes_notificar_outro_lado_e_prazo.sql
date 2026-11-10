-- 350 — Solicitações: resposta notifica sempre o OUTRO lado + prazo escolhido na criação (10/11/2026).
--
-- Caso real (Sergio Flavio Piffer Crozatti, 09/11): o comercial (Bruno, quem pediu) respondeu pelo painel
-- "Responder" e a Fabricia (responsável) não recebeu nada; a única notificação foi para o próprio Bruno.
-- Causas:
--   1. responder_solicitacao só notificava o SOLICITANTE (e o responsável apenas quando um terceiro
--      respondia) — quem pediu respondendo não avisava ninguém.
--   2. Trigger antigo trg_sol_op_retorno (migration 038) notificava o solicitante a cada mudança de
--      retorno_operacional, mesmo quando era ele quem escrevia — e duplicava a notificação da RPC
--      ("Retorno da solicitação operacional" + "Operacional respondeu à solicitação").
-- Agora: quem responde notifica os outros dois papéis (solicitante e responsável), nunca a si mesmo, uma vez
-- só por pessoa. O trigger 038 sai (a RPC é o único caminho que grava retorno_operacional).
--
-- Prazo: criar_solicitacao_operacional ganha p_sla_at (data e hora de término escolhida na tela). Sem ele,
-- continua o cálculo antigo (sla_config_operacional ou 24h).

DROP TRIGGER IF EXISTS trg_sol_op_retorno ON solicitacoes_operacionais;
DROP FUNCTION IF EXISTS fn_notificar_sol_op_retorno();

CREATE OR REPLACE FUNCTION responder_solicitacao(
  p_id            UUID,
  p_retorno       TEXT,
  p_status        TEXT,
  p_anexo_path    TEXT DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sol      solicitacoes_operacionais%ROWTYPE;
  v_caller   UUID := auth.uid();
  v_nome     TEXT;
  v_retorno  TEXT := NULLIF(btrim(COALESCE(p_retorno, '')), '');
  v_mensagem TEXT;
  v_rotulo   TEXT;
BEGIN
  SELECT * INTO v_sol
    FROM solicitacoes_operacionais
   WHERE id = p_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada';
  END IF;

  SELECT nome INTO v_nome FROM usuarios
   WHERE id = v_caller AND empresa_id = v_sol.empresa_id AND ativo = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  v_rotulo := CASE p_status
    WHEN 'pendente'            THEN 'Pendente'
    WHEN 'em_andamento'        THEN 'Em andamento'
    WHEN 'aguardando_resposta' THEN 'Aguardando resposta'
    WHEN 'aguardando_cliente'  THEN 'Aguardando cliente'
    WHEN 'concluido'           THEN 'Concluído'
    WHEN 'cancelado'           THEN 'Cancelado'
    ELSE p_status
  END;

  v_mensagem := CASE
    WHEN v_retorno IS NOT NULL THEN v_retorno
    WHEN p_status IS DISTINCT FROM v_sol.status::TEXT THEN 'Status alterado para ' || v_rotulo
    ELSE NULL
  END;

  UPDATE solicitacoes_operacionais SET
    retorno_operacional = COALESCE(v_retorno, retorno_operacional),
    status              = p_status::status_solicitacao,
    concluido_em        = CASE WHEN p_status = 'concluido' THEN now() ELSE concluido_em END,
    anexo_retorno_path  = COALESCE(p_anexo_path, anexo_retorno_path),
    respondido_por_id   = CASE WHEN v_mensagem IS NOT NULL THEN v_caller ELSE respondido_por_id END,
    respondido_em       = CASE WHEN v_mensagem IS NOT NULL THEN now() ELSE respondido_em END,
    updated_at          = now()
  WHERE id = p_id;

  IF v_mensagem IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO solicitacao_mensagens(empresa_id, solicitacao_id, autor_id, texto)
  VALUES (v_sol.empresa_id, p_id, v_caller, v_mensagem);

  -- Quem pediu fica sabendo da resposta de quem atende (ou de um terceiro).
  IF v_sol.solicitante_id IS NOT NULL AND v_sol.solicitante_id IS DISTINCT FROM v_caller THEN
    INSERT INTO notificacoes(empresa_id, usuario_id, tipo, titulo, mensagem, entidade_id, entidade)
    VALUES (v_sol.empresa_id, v_sol.solicitante_id, 'solicitacao_retorno',
            COALESCE(v_nome, 'Operacional') || ' respondeu à solicitação',
            left(v_mensagem, 100), p_id, 'solicitacao');
  END IF;

  -- Quem atende fica sabendo da resposta de quem pediu (o caso que faltava) ou de um terceiro.
  IF v_sol.responsavel_id IS NOT NULL AND v_sol.responsavel_id IS DISTINCT FROM v_caller
     AND v_sol.responsavel_id IS DISTINCT FROM v_sol.solicitante_id THEN
    INSERT INTO notificacoes(empresa_id, usuario_id, tipo, titulo, mensagem, entidade_id, entidade)
    VALUES (v_sol.empresa_id, v_sol.responsavel_id, 'solicitacao_respondida',
            COALESCE(v_nome, 'Comercial') || ' respondeu à solicitação',
            left(v_mensagem, 100), p_id, 'solicitacao');
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION responder_solicitacao(UUID, TEXT, TEXT, TEXT) TO authenticated;

-- ── Prazo escolhido na criação ──────────────────────────────────────────────
DROP FUNCTION IF EXISTS criar_solicitacao_operacional(
  tipo_solicitacao, TEXT, TEXT, prioridade_solicitacao, UUID, UUID, UUID, UUID, UUID);

CREATE OR REPLACE FUNCTION criar_solicitacao_operacional(
  p_tipo           tipo_solicitacao,
  p_titulo         TEXT,
  p_descricao      TEXT                   DEFAULT NULL,
  p_prioridade     prioridade_solicitacao DEFAULT 'normal',
  p_responsavel_id UUID                   DEFAULT NULL,
  p_lead_id        UUID                   DEFAULT NULL,
  p_processo_id    UUID                   DEFAULT NULL,
  p_pessoa_id      UUID                   DEFAULT NULL,
  p_conversa_id    UUID                   DEFAULT NULL,
  p_sla_at         TIMESTAMPTZ            DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_empresa_id     UUID;
  v_solicitante_id UUID;
  v_horas_sla      INTEGER;
  v_id             UUID;
BEGIN
  SELECT id, empresa_id
    INTO v_solicitante_id, v_empresa_id
    FROM usuarios
   WHERE auth_user_id = auth.uid() AND ativo = true
   LIMIT 1;

  IF v_solicitante_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado ou inativo';
  END IF;

  IF p_sla_at IS NULL THEN
    SELECT horas_sla
      INTO v_horas_sla
      FROM sla_config_operacional
     WHERE empresa_id = v_empresa_id AND tipo = p_tipo AND ativo = true;
  END IF;

  INSERT INTO solicitacoes_operacionais (
    empresa_id, tipo, titulo, descricao, prioridade,
    responsavel_id, solicitante_id,
    lead_id, processo_id, pessoa_id, conversa_id,
    sla_at
  ) VALUES (
    v_empresa_id, p_tipo, trim(p_titulo), p_descricao, p_prioridade,
    p_responsavel_id, v_solicitante_id,
    p_lead_id, p_processo_id, p_pessoa_id, p_conversa_id,
    COALESCE(p_sla_at, now() + (COALESCE(v_horas_sla, 24) || ' hours')::INTERVAL)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION criar_solicitacao_operacional(
  tipo_solicitacao, TEXT, TEXT, prioridade_solicitacao, UUID, UUID, UUID, UUID, UUID, TIMESTAMPTZ) TO authenticated;
