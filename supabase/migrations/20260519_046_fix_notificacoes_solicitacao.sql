-- Corrige as RPCs enviar_mensagem_solicitacao e responder_solicitacao:
-- As migrações 039-041 usavam referencia_id/referencia_tipo (inexistentes).
-- A tabela notificacoes usa entidade_id/entidade.
-- Também adiciona os enum values e amplia o CHECK de entidade.

ALTER TYPE tipo_notificacao ADD VALUE IF NOT EXISTS 'solicitacao_respondida';
ALTER TYPE tipo_notificacao ADD VALUE IF NOT EXISTS 'solicitacao_retorno';

ALTER TABLE notificacoes DROP CONSTRAINT IF EXISTS notificacoes_entidade_check;
ALTER TABLE notificacoes
  ADD CONSTRAINT notificacoes_entidade_check
  CHECK (entidade IN ('processo', 'lead', 'tarefa', 'solicitacao'));

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

  IF NOT EXISTS (
    SELECT 1 FROM usuarios
     WHERE id = v_caller AND empresa_id = v_sol.empresa_id AND ativo = true
  ) THEN
    RAISE EXCEPTION 'Sem permissão para enviar mensagem nesta solicitação';
  END IF;

  v_dest_id := CASE
    WHEN v_caller = v_sol.solicitante_id THEN v_sol.responsavel_id
    WHEN v_caller = v_sol.responsavel_id THEN v_sol.solicitante_id
    ELSE v_sol.responsavel_id
  END;

  INSERT INTO solicitacao_mensagens(empresa_id, solicitacao_id, autor_id, texto)
  VALUES (v_sol.empresa_id, p_solicitacao_id, v_caller, p_texto)
  RETURNING id INTO v_msg_id;

  IF v_dest_id IS NOT NULL AND v_dest_id != v_caller THEN
    INSERT INTO notificacoes(empresa_id, usuario_id, tipo, titulo, mensagem, entidade_id, entidade)
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

  IF NOT EXISTS (
    SELECT 1 FROM usuarios
     WHERE id = auth.uid() AND empresa_id = v_sol.empresa_id AND ativo = true
  ) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  UPDATE solicitacoes_operacionais SET
    retorno_operacional = p_retorno,
    status              = p_status::status_solicitacao,
    concluido_em        = CASE WHEN p_status = 'concluido' THEN now() ELSE concluido_em END,
    anexo_retorno_path  = COALESCE(p_anexo_path, anexo_retorno_path),
    updated_at          = now()
  WHERE id = p_id;

  INSERT INTO solicitacao_mensagens(empresa_id, solicitacao_id, autor_id, texto)
  VALUES (v_sol.empresa_id, p_id, auth.uid(), p_retorno);

  IF v_sol.solicitante_id IS NOT NULL AND v_sol.solicitante_id != auth.uid() THEN
    INSERT INTO notificacoes(empresa_id, usuario_id, tipo, titulo, mensagem, entidade_id, entidade)
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
