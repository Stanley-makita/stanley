-- Fase D do Construtor de Contratos — a Timeline já registra automaticamente
-- (trigger `fn_contrato_timeline_evento`, migration 105) toda inserção de
-- `processo_contratos` como "Contrato criado: ...", mas isso não distinguia
-- o primeiro rascunho de uma nova versão criada a partir de um contrato já
-- enviado/assinado (Fase C, "Criar nova versão"). Só torna a MESMA mensagem
-- de INSERT ciente da versão — não cria um segundo mecanismo de log paralelo.
CREATE OR REPLACE FUNCTION fn_contrato_timeline_evento()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_texto TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_texto := CASE
      WHEN NEW.versao > 1 THEN 'Nova versão (v' || NEW.versao || ') criada: ' || NEW.titulo
      ELSE 'Contrato criado: ' || NEW.titulo
    END;

    INSERT INTO processo_comentarios
      (empresa_id, processo_id, usuario_id, tipo, texto, notificar_cliente)
    VALUES
      (NEW.empresa_id, NEW.processo_id, NULL, 'alteracao', v_texto, false);

  ELSIF TG_OP = 'UPDATE' THEN

    IF (OLD.clicksign_status IS DISTINCT FROM NEW.clicksign_status)
       AND NEW.clicksign_status = 'running' THEN
      v_texto := 'Contrato "' || NEW.titulo || '" (v' || NEW.versao || ') enviado para assinatura via Clicksign.';

      INSERT INTO processo_comentarios
        (empresa_id, processo_id, usuario_id, tipo, texto, notificar_cliente)
      VALUES
        (NEW.empresa_id, NEW.processo_id, NULL, 'alteracao', v_texto, false);

    ELSIF (OLD.clicksign_status IS DISTINCT FROM NEW.clicksign_status)
          AND NEW.clicksign_status = 'closed' THEN
      v_texto := 'Contrato "' || NEW.titulo || '" (v' || NEW.versao || ') assinado por todas as partes.';

      INSERT INTO processo_comentarios
        (empresa_id, processo_id, usuario_id, tipo, texto, notificar_cliente)
      VALUES
        (NEW.empresa_id, NEW.processo_id, NULL, 'alteracao', v_texto, false);
    END IF;

  END IF;

  RETURN NEW;
END;
$$;
