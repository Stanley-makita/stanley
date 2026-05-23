-- Notificação para o comercial quando operacional responde uma solicitação
-- (INSERT em notificacoes é REVOKED de authenticated — usa trigger SECURITY DEFINER)

ALTER TYPE tipo_notificacao ADD VALUE IF NOT EXISTS 'solicitacao_retorno';

-- Notifica solicitante quando operacional preenche retorno_operacional
CREATE OR REPLACE FUNCTION fn_notificar_sol_op_retorno()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_responsavel_nome TEXT;
BEGIN
  -- Só dispara quando retorno_operacional é definido pela primeira vez
  IF NEW.retorno_operacional IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.retorno_operacional IS NOT DISTINCT FROM NEW.retorno_operacional THEN
    RETURN NEW;
  END IF;
  -- Não notifica se solicitante e responsável são a mesma pessoa
  IF NEW.solicitante_id IS NOT DISTINCT FROM NEW.responsavel_id THEN RETURN NEW; END IF;
  IF NEW.solicitante_id IS NULL THEN RETURN NEW; END IF;

  SELECT nome INTO v_responsavel_nome
  FROM usuarios
  WHERE id = auth.uid();

  INSERT INTO notificacoes (empresa_id, usuario_id, tipo, titulo, mensagem, entidade, entidade_id)
  VALUES (
    NEW.empresa_id,
    NEW.solicitante_id,
    'solicitacao_retorno',
    'Retorno da solicitação operacional',
    COALESCE(v_responsavel_nome, 'Operacional') || ': "' ||
      LEFT(NEW.retorno_operacional, 120) ||
      CASE WHEN LENGTH(NEW.retorno_operacional) > 120 THEN '..."' ELSE '"' END,
    'solicitacao',
    NEW.id
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sol_op_retorno
  AFTER UPDATE OF retorno_operacional ON solicitacoes_operacionais
  FOR EACH ROW EXECUTE FUNCTION fn_notificar_sol_op_retorno();
