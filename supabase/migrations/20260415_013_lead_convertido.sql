-- ============================================================
-- Migration: 20260415_013_lead_convertido
-- Vincula leads a processos e gerencia status de conversão
-- ============================================================

-- Adiciona coluna de conversão em leads
ALTER TABLE leads ADD COLUMN IF NOT EXISTS convertido_em TIMESTAMPTZ;

-- Função SECURITY DEFINER para marcar lead como convertido
-- Necessária pois o executor pode não ser o responsável do lead
CREATE OR REPLACE FUNCTION marcar_lead_convertido(p_lead_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa_id UUID;
  v_caller_empresa UUID;
BEGIN
  SELECT empresa_id INTO v_empresa_id
  FROM leads
  WHERE id = p_lead_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead não encontrado';
  END IF;

  SELECT empresa_id INTO v_caller_empresa
  FROM usuarios
  WHERE auth_user_id = auth.uid()
  LIMIT 1;

  IF v_empresa_id IS DISTINCT FROM v_caller_empresa THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  UPDATE leads
  SET convertido_em = NOW(), updated_at = NOW()
  WHERE id = p_lead_id;
END;
$$;

REVOKE ALL ON FUNCTION marcar_lead_convertido(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION marcar_lead_convertido(UUID) TO authenticated;
