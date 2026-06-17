-- =============================================================================
-- MIGRATION 105 — Timeline automática para eventos de contratos
-- =============================================================================

-- 1. Tornar usuario_id nullable para permitir eventos do sistema (Sistema)
ALTER TABLE processo_comentarios
  ALTER COLUMN usuario_id DROP NOT NULL;

-- 2. Trigger que registra eventos de contrato na timeline do processo
CREATE OR REPLACE FUNCTION fn_contrato_timeline_evento()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_texto TEXT;
BEGIN
  -- INSERT: contrato criado (rascunho)
  IF TG_OP = 'INSERT' THEN
    v_texto := 'Contrato criado: ' || NEW.titulo;

    INSERT INTO processo_comentarios
      (empresa_id, processo_id, usuario_id, tipo, texto, notificar_cliente)
    VALUES
      (NEW.empresa_id, NEW.processo_id, NULL, 'alteracao', v_texto, false);

  -- UPDATE: observar mudanças de status Clicksign
  ELSIF TG_OP = 'UPDATE' THEN

    -- Enviado para assinatura
    IF (OLD.clicksign_status IS DISTINCT FROM NEW.clicksign_status)
       AND NEW.clicksign_status = 'running' THEN
      v_texto := 'Contrato "' || NEW.titulo || '" enviado para assinatura via Clicksign.';

      INSERT INTO processo_comentarios
        (empresa_id, processo_id, usuario_id, tipo, texto, notificar_cliente)
      VALUES
        (NEW.empresa_id, NEW.processo_id, NULL, 'alteracao', v_texto, false);

    -- Assinado por todas as partes
    ELSIF (OLD.clicksign_status IS DISTINCT FROM NEW.clicksign_status)
          AND NEW.clicksign_status = 'closed' THEN
      v_texto := 'Contrato "' || NEW.titulo || '" assinado por todas as partes.';

      INSERT INTO processo_comentarios
        (empresa_id, processo_id, usuario_id, tipo, texto, notificar_cliente)
      VALUES
        (NEW.empresa_id, NEW.processo_id, NULL, 'alteracao', v_texto, false);
    END IF;

  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_contrato_timeline
  AFTER INSERT OR UPDATE ON processo_contratos
  FOR EACH ROW EXECUTE FUNCTION fn_contrato_timeline_evento();
