-- Responder solicitação com o campo de retorno em branco (20/10/2026).
-- O painel de resposta agora abre com o campo vazio (antes vinha com o último retorno, e
-- concluir sem apagar reenviava a mesma mensagem — conversa, Histórico e WhatsApp).
-- Com o campo vazio:
--   - `retorno_operacional` mantém o último retorno (não é apagado);
--   - só mudou o status → a conversa ganha "Status alterado para X" (o aviso por WhatsApp
--     e o Histórico do lead leem a conversa — a conclusão continua aparecendo);
--   - nada mudou → nenhuma mensagem e nenhuma notificação.
-- Resto igual à migration 343 (respondido_por, notificação do responsável quando um
-- terceiro responde).

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
  v_terceiro BOOLEAN;
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

  IF NOT EXISTS (
    SELECT 1 FROM usuarios
     WHERE id = v_caller AND empresa_id = v_sol.empresa_id AND ativo = true
  ) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  v_terceiro := v_caller IS DISTINCT FROM v_sol.solicitante_id
            AND v_caller IS DISTINCT FROM v_sol.responsavel_id;

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

  IF v_sol.solicitante_id IS NOT NULL AND v_sol.solicitante_id != v_caller THEN
    INSERT INTO notificacoes(empresa_id, usuario_id, tipo, titulo, mensagem, entidade_id, entidade)
    VALUES (
      v_sol.empresa_id,
      v_sol.solicitante_id,
      'solicitacao_retorno',
      'Operacional respondeu à solicitação',
      left(v_mensagem, 100),
      p_id,
      'solicitacao'
    );
  END IF;

  IF v_terceiro AND v_sol.responsavel_id IS NOT NULL
     AND v_sol.responsavel_id IS DISTINCT FROM v_sol.solicitante_id THEN
    INSERT INTO notificacoes(empresa_id, usuario_id, tipo, titulo, mensagem, entidade_id, entidade)
    VALUES (
      v_sol.empresa_id,
      v_sol.responsavel_id,
      'solicitacao_retorno',
      'Outra pessoa respondeu à sua solicitação',
      left(v_mensagem, 100),
      p_id,
      'solicitacao'
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION responder_solicitacao(UUID, TEXT, TEXT, TEXT) TO authenticated;
