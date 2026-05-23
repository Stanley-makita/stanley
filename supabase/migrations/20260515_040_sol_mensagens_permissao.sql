-- Relaxa permissão da RPC enviar_mensagem_solicitacao:
-- Qualquer membro ativo da empresa pode enviar mensagem (não só solicitante/responsável)
-- Isso permite que gestores e outros usuários participem da thread

CREATE OR REPLACE FUNCTION enviar_mensagem_solicitacao(
  p_solicitacao_id UUID,
  p_texto          TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sol     solicitacoes_operacionais%ROWTYPE;
  v_dest_id UUID;
  v_msg_id  UUID;
  v_caller  UUID := auth.uid();
BEGIN
  SELECT * INTO v_sol
    FROM solicitacoes_operacionais
   WHERE id = p_solicitacao_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada';
  END IF;

  -- Verifica que o chamador é membro ativo da mesma empresa
  IF NOT EXISTS (
    SELECT 1 FROM usuarios
     WHERE id = v_caller AND empresa_id = v_sol.empresa_id AND ativo = true
  ) THEN
    RAISE EXCEPTION 'Sem permissão para enviar mensagem nesta solicitação';
  END IF;

  -- Destinatário: se for o solicitante, notifica o responsável e vice-versa
  -- Para outros usuários (gestores), notifica o responsável por padrão
  v_dest_id := CASE
    WHEN v_caller = v_sol.solicitante_id THEN v_sol.responsavel_id
    WHEN v_caller = v_sol.responsavel_id THEN v_sol.solicitante_id
    ELSE v_sol.responsavel_id  -- gestor notifica o responsável
  END;

  INSERT INTO solicitacao_mensagens(empresa_id, solicitacao_id, autor_id, texto)
  VALUES (v_sol.empresa_id, p_solicitacao_id, v_caller, p_texto)
  RETURNING id INTO v_msg_id;

  -- Notificação para o destinatário (se existir e for diferente do remetente)
  IF v_dest_id IS NOT NULL AND v_dest_id != v_caller THEN
    INSERT INTO notificacoes(empresa_id, usuario_id, tipo, titulo, mensagem, referencia_id, referencia_tipo)
    VALUES (
      v_sol.empresa_id,
      v_dest_id,
      CASE
        WHEN v_caller = v_sol.responsavel_id THEN 'solicitacao_retorno'::tipo_notificacao
        ELSE 'solicitacao_respondida'::tipo_notificacao
      END,
      CASE
        WHEN v_caller = v_sol.responsavel_id THEN 'Operacional adicionou mensagem'
        ELSE 'Comercial respondeu à solicitação'
      END,
      left(p_texto, 100),
      p_solicitacao_id,
      'solicitacao'
    );
  END IF;

  RETURN v_msg_id;
END;
$$;

GRANT EXECUTE ON FUNCTION enviar_mensagem_solicitacao(UUID, TEXT) TO authenticated;
