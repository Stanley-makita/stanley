-- Anexos em Notas (Lead) e Comentários (Processo).
--
-- Reaproveita a tabela `documento_vinculos` (já usada pra ligar um
-- documento a `lead`/`processo`) em vez de criar tabela nova — só amplia
-- os tipos de entidade aceitos pra incluir `lead_historico` e
-- `processo_comentario`, apontando `entidade_id` pra uma linha específica
-- de `lead_historico`/`processo_comentarios`.
--
-- Decisão explícita do usuário: um documento anexado numa nota/comentário
-- NÃO aparece automaticamente na aba Documentos geral do Lead/Negócio —
-- fica só ali, a menos que o usuário anexe manualmente também em
-- Documentos. Por isso só existe UM vínculo (lead_historico/
-- processo_comentario), nunca um vínculo adicional em 'lead'/'processo'.

ALTER TABLE documento_vinculos DROP CONSTRAINT IF EXISTS documento_vinculos_entidade_tipo_check;
ALTER TABLE documento_vinculos ADD CONSTRAINT documento_vinculos_entidade_tipo_check
  CHECK (entidade_tipo IN ('lead', 'processo', 'lead_historico', 'processo_comentario'));

-- registrar_interacao_lead precisa devolver o id da linha criada, pra dar
-- pra vincular o anexo a ela logo em seguida.
CREATE OR REPLACE FUNCTION registrar_interacao_lead(
  p_lead_id   UUID,
  p_descricao TEXT,
  p_tipo      TEXT DEFAULT 'comentario'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa_id     UUID;
  v_caller_empresa UUID;
  v_usuario_id     UUID;
  v_id             UUID;
BEGIN
  SELECT empresa_id INTO v_empresa_id
  FROM leads
  WHERE id = p_lead_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead não encontrado';
  END IF;

  SELECT empresa_id, id INTO v_caller_empresa, v_usuario_id
  FROM usuarios
  WHERE auth_user_id = auth.uid()
  LIMIT 1;

  IF v_empresa_id IS DISTINCT FROM v_caller_empresa THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  IF length(trim(p_descricao)) = 0 THEN
    RAISE EXCEPTION 'Descrição não pode ser vazia';
  END IF;

  INSERT INTO lead_historico (lead_id, empresa_id, usuario_id, tipo, descricao)
  VALUES (p_lead_id, v_empresa_id, v_usuario_id, p_tipo, trim(p_descricao))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION registrar_interacao_lead(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION registrar_interacao_lead(UUID, TEXT, TEXT) TO authenticated;
