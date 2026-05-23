-- ============================================================
-- Migration: 20260430_014_lead_interacoes
-- Permite consultores registrarem interações manuais em leads
-- (ligações, reuniões, notas de WhatsApp, etc.)
-- Reutiliza lead_historico com tipo='comentario'
-- ============================================================

CREATE OR REPLACE FUNCTION registrar_interacao_lead(
  p_lead_id   UUID,
  p_descricao TEXT,
  p_tipo      TEXT DEFAULT 'comentario'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa_id     UUID;
  v_caller_empresa UUID;
  v_usuario_id     UUID;
BEGIN
  -- Valida que o lead pertence à empresa do caller
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
  VALUES (p_lead_id, v_empresa_id, v_usuario_id, p_tipo, trim(p_descricao));
END;
$$;

REVOKE ALL ON FUNCTION registrar_interacao_lead(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION registrar_interacao_lead(UUID, TEXT, TEXT) TO authenticated;
