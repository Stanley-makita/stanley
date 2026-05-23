-- Réplica do comercial nas solicitações operacionais
-- Permite que o comercial responda ao retorno enviado pelo operacional

ALTER TABLE solicitacoes_operacionais
  ADD COLUMN IF NOT EXISTS replica_comercial TEXT,
  ADD COLUMN IF NOT EXISTS replica_em        TIMESTAMPTZ;

-- Novo valor no enum de notificações
ALTER TYPE tipo_notificacao ADD VALUE IF NOT EXISTS 'solicitacao_respondida';

-- RPC SECURITY DEFINER: salva a réplica e cria a notificação para o operacional
-- (INSERT em notificacoes é REVOKED de authenticated — precisa desta função)
CREATE OR REPLACE FUNCTION enviar_replica_comercial(
  p_id    UUID,
  p_texto TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_solicitacao solicitacoes_operacionais%ROWTYPE;
  v_solicitante_nome TEXT;
BEGIN
  -- Busca a solicitação e valida pertencimento
  SELECT * INTO v_solicitacao
  FROM solicitacoes_operacionais
  WHERE id = p_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada';
  END IF;

  -- Verifica que o chamador é o solicitante
  IF v_solicitacao.solicitante_id <> auth.uid() THEN
    RAISE EXCEPTION 'Apenas o solicitante pode enviar uma réplica';
  END IF;

  -- Salva a réplica
  UPDATE solicitacoes_operacionais
  SET replica_comercial = p_texto,
      replica_em        = NOW(),
      updated_at        = NOW()
  WHERE id = p_id;

  -- Notifica o responsável operacional (se houver)
  IF v_solicitacao.responsavel_id IS NOT NULL THEN
    SELECT nome INTO v_solicitante_nome
    FROM usuarios
    WHERE id = auth.uid();

    INSERT INTO notificacoes (
      empresa_id,
      usuario_id,
      tipo,
      titulo,
      mensagem,
      entidade,
      entidade_id
    ) VALUES (
      v_solicitacao.empresa_id,
      v_solicitacao.responsavel_id,
      'solicitacao_respondida',
      'Comercial respondeu à solicitação',
      COALESCE(v_solicitante_nome, 'Comercial') || ': "' || LEFT(p_texto, 100) || CASE WHEN LENGTH(p_texto) > 100 THEN '...' ELSE '"' END,
      'solicitacao',
      p_id
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION enviar_replica_comercial(UUID, TEXT) TO authenticated;
