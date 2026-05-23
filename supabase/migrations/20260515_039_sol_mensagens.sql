-- Thread de mensagens para solicitações operacionais
-- Substitui o padrão de réplica única (replica_comercial) por histórico ilimitado

CREATE TABLE IF NOT EXISTS solicitacao_mensagens (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     UUID        NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  solicitacao_id UUID        NOT NULL REFERENCES solicitacoes_operacionais(id) ON DELETE CASCADE,
  autor_id       UUID        NOT NULL REFERENCES auth.users(id),
  texto          TEXT        NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE solicitacao_mensagens ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_sol_mensagens_solicitacao ON solicitacao_mensagens(solicitacao_id);

-- RLS: membros da empresa leem; quem enviou ou é parte da solicitação escreve
CREATE POLICY "sol_msg_select" ON solicitacao_mensagens
  FOR SELECT USING (empresa_id IN (
    SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true));

CREATE POLICY "sol_msg_insert" ON solicitacao_mensagens
  FOR INSERT WITH CHECK (empresa_id IN (
    SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true));

-- RPC SECURITY DEFINER: insere mensagem + dispara notificação para o outro lado
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
BEGIN
  SELECT * INTO v_sol
    FROM solicitacoes_operacionais
   WHERE id = p_solicitacao_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada';
  END IF;

  IF auth.uid() NOT IN (v_sol.solicitante_id, v_sol.responsavel_id) THEN
    RAISE EXCEPTION 'Sem permissão para enviar mensagem nesta solicitação';
  END IF;

  -- Destinatário é o outro lado da conversa
  v_dest_id := CASE
    WHEN auth.uid() = v_sol.solicitante_id THEN v_sol.responsavel_id
    ELSE v_sol.solicitante_id
  END;

  INSERT INTO solicitacao_mensagens(empresa_id, solicitacao_id, autor_id, texto)
  VALUES (v_sol.empresa_id, p_solicitacao_id, auth.uid(), p_texto)
  RETURNING id INTO v_msg_id;

  -- Notificação para o destinatário
  IF v_dest_id IS NOT NULL THEN
    INSERT INTO notificacoes(empresa_id, usuario_id, tipo, titulo, mensagem, referencia_id, referencia_tipo)
    VALUES (
      v_sol.empresa_id,
      v_dest_id,
      CASE
        WHEN auth.uid() = v_sol.solicitante_id THEN 'solicitacao_respondida'::tipo_notificacao
        ELSE 'solicitacao_retorno'::tipo_notificacao
      END,
      CASE
        WHEN auth.uid() = v_sol.solicitante_id THEN 'Comercial respondeu à solicitação'
        ELSE 'Operacional adicionou mensagem'
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
