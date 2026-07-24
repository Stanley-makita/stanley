-- Fix da migration 20260725_192.
--
-- A 20260725_192 rodou como um único bloco no SQL Editor. Postgres não
-- permite trocar o tipo de retorno de uma função existente via
-- CREATE OR REPLACE (precisa DROP antes) — isso deu erro na parte da
-- função, e como o SQL Editor executa o bloco inteiro numa transação
-- implícita, o erro reverteu TUDO, inclusive o ALTER TABLE do CHECK de
-- entidade_tipo, que nunca chegou a valer de verdade. Confirmado testando
-- direto no banco: insert com entidade_tipo='processo_comentario' ainda
-- violava a constraint antiga.

DROP FUNCTION IF EXISTS registrar_interacao_lead(UUID, TEXT, TEXT);

CREATE FUNCTION registrar_interacao_lead(
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

ALTER TABLE documento_vinculos DROP CONSTRAINT IF EXISTS documento_vinculos_entidade_tipo_check;
ALTER TABLE documento_vinculos ADD CONSTRAINT documento_vinculos_entidade_tipo_check
  CHECK (entidade_tipo IN ('lead', 'processo', 'lead_historico', 'processo_comentario'));
