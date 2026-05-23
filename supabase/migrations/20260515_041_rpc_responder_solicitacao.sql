-- RPC SECURITY DEFINER para responder solicitação operacional
-- Substitui o UPDATE direto do frontend: agora também grava na thread de mensagens

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
  v_sol solicitacoes_operacionais%ROWTYPE;
BEGIN
  SELECT * INTO v_sol
    FROM solicitacoes_operacionais
   WHERE id = p_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada';
  END IF;

  -- Qualquer membro ativo da empresa pode responder
  IF NOT EXISTS (
    SELECT 1 FROM usuarios
     WHERE id = auth.uid() AND empresa_id = v_sol.empresa_id AND ativo = true
  ) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  -- Atualiza a solicitação
  UPDATE solicitacoes_operacionais SET
    retorno_operacional = p_retorno,
    status              = p_status::status_solicitacao,
    concluido_em        = CASE WHEN p_status = 'concluido' THEN now() ELSE concluido_em END,
    anexo_retorno_path  = COALESCE(p_anexo_path, anexo_retorno_path),
    updated_at          = now()
  WHERE id = p_id;

  -- Registra na thread de mensagens para manter histórico
  INSERT INTO solicitacao_mensagens(empresa_id, solicitacao_id, autor_id, texto)
  VALUES (v_sol.empresa_id, p_id, auth.uid(), p_retorno);

  -- Notifica o solicitante
  IF v_sol.solicitante_id IS NOT NULL AND v_sol.solicitante_id != auth.uid() THEN
    INSERT INTO notificacoes(empresa_id, usuario_id, tipo, titulo, mensagem, referencia_id, referencia_tipo)
    VALUES (
      v_sol.empresa_id,
      v_sol.solicitante_id,
      'solicitacao_retorno'::tipo_notificacao,
      'Operacional respondeu à solicitação',
      left(p_retorno, 100),
      p_id,
      'solicitacao'
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION responder_solicitacao(UUID, TEXT, TEXT, TEXT) TO authenticated;
