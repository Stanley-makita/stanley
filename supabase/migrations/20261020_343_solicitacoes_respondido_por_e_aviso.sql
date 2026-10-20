-- Solicitações operacionais (pedido da equipe, 20/10/2026):
--
-- 1) Qualquer usuário da empresa pode responder uma solicitação (inclusive pela aba
--    Solicitações do lead). Quem deu o último retorno fica gravado em
--    `respondido_por_id`/`respondido_em` — para saber quando quem respondeu NÃO foi
--    nem quem pediu nem o responsável. Nesse caso, solicitante E responsável são
--    notificados no sino.
--
-- 2) Aviso por WhatsApp (rota /api/solicitacoes/[id]/aviso): espera 1 minuto sem
--    novidade e manda um resumo das mensagens novas para quem pediu e para o comercial
--    do lead/negócio. `aviso_whatsapp_ate` = created_at da última mensagem já avisada;
--    `aviso_status_avisado` = status já avisado (depois de avisar "Concluído"/"Cancelado"
--    não avisa mais). Solicitações que já existem nascem como "já avisadas": nada é
--    disparado retroativamente.

ALTER TABLE solicitacoes_operacionais
  ADD COLUMN IF NOT EXISTS respondido_por_id UUID REFERENCES usuarios(id),
  ADD COLUMN IF NOT EXISTS respondido_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS aviso_whatsapp_ate TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS aviso_status_avisado TEXT;

UPDATE solicitacoes_operacionais
SET aviso_whatsapp_ate   = now(),
    aviso_status_avisado = status::TEXT
WHERE aviso_whatsapp_ate IS NULL;

-- Solicitação nova começa a contar a partir de quando foi criada.
ALTER TABLE solicitacoes_operacionais
  ALTER COLUMN aviso_whatsapp_ate SET DEFAULT now();

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

  UPDATE solicitacoes_operacionais SET
    retorno_operacional = p_retorno,
    status              = p_status::status_solicitacao,
    concluido_em        = CASE WHEN p_status = 'concluido' THEN now() ELSE concluido_em END,
    anexo_retorno_path  = COALESCE(p_anexo_path, anexo_retorno_path),
    respondido_por_id   = v_caller,
    respondido_em       = now(),
    updated_at          = now()
  WHERE id = p_id;

  INSERT INTO solicitacao_mensagens(empresa_id, solicitacao_id, autor_id, texto)
  VALUES (v_sol.empresa_id, p_id, v_caller, p_retorno);

  IF v_sol.solicitante_id IS NOT NULL AND v_sol.solicitante_id != v_caller THEN
    INSERT INTO notificacoes(empresa_id, usuario_id, tipo, titulo, mensagem, entidade_id, entidade)
    VALUES (
      v_sol.empresa_id,
      v_sol.solicitante_id,
      'solicitacao_retorno',
      'Operacional respondeu à solicitação',
      left(p_retorno, 100),
      p_id,
      'solicitacao'
    );
  END IF;

  -- Respondida por outra pessoa: o responsável também fica sabendo.
  IF v_terceiro AND v_sol.responsavel_id IS NOT NULL
     AND v_sol.responsavel_id IS DISTINCT FROM v_sol.solicitante_id THEN
    INSERT INTO notificacoes(empresa_id, usuario_id, tipo, titulo, mensagem, entidade_id, entidade)
    VALUES (
      v_sol.empresa_id,
      v_sol.responsavel_id,
      'solicitacao_retorno',
      'Outra pessoa respondeu à sua solicitação',
      left(p_retorno, 100),
      p_id,
      'solicitacao'
    );
  END IF;
END;
$$;

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
  v_msg_id  UUID;
  v_caller  UUID := auth.uid();
  v_dest_id UUID;
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

  INSERT INTO solicitacao_mensagens(empresa_id, solicitacao_id, autor_id, texto)
  VALUES (v_sol.empresa_id, p_solicitacao_id, v_caller, p_texto)
  RETURNING id INTO v_msg_id;

  -- Solicitante ↔ responsável notificam o outro lado; terceiro notifica os dois.
  FOREACH v_dest_id IN ARRAY ARRAY[v_sol.solicitante_id, v_sol.responsavel_id] LOOP
    CONTINUE WHEN v_dest_id IS NULL OR v_dest_id = v_caller;
    INSERT INTO notificacoes(empresa_id, usuario_id, tipo, titulo, mensagem, entidade_id, entidade)
    VALUES (
      v_sol.empresa_id,
      v_dest_id,
      CASE WHEN v_caller = v_sol.responsavel_id THEN 'solicitacao_retorno' ELSE 'solicitacao_respondida' END,
      CASE WHEN v_caller = v_sol.responsavel_id THEN 'Operacional adicionou mensagem'
           WHEN v_caller = v_sol.solicitante_id THEN 'Comercial respondeu à solicitação'
           ELSE 'Nova mensagem na solicitação' END,
      left(p_texto, 100),
      p_solicitacao_id,
      'solicitacao'
    );
    -- Solicitante e responsável são a mesma pessoa: uma notificação só.
    EXIT WHEN v_sol.solicitante_id = v_sol.responsavel_id;
  END LOOP;

  RETURN v_msg_id;
END;
$$;

GRANT EXECUTE ON FUNCTION responder_solicitacao(UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION enviar_mensagem_solicitacao(UUID, TEXT) TO authenticated;
