-- Migration: notificações para solicitações operacionais
-- Adiciona novos tipos ao enum e triggers de notificação

ALTER TYPE tipo_notificacao ADD VALUE IF NOT EXISTS 'solicitacao_atribuida';
ALTER TYPE tipo_notificacao ADD VALUE IF NOT EXISTS 'solicitacao_concluida';
ALTER TYPE tipo_notificacao ADD VALUE IF NOT EXISTS 'solicitacao_sla_vencido';

-- Atualiza constraint de entidade para incluir 'solicitacao'
ALTER TABLE notificacoes DROP CONSTRAINT IF EXISTS notificacoes_entidade_check;
ALTER TABLE notificacoes ADD CONSTRAINT notificacoes_entidade_check
  CHECK (entidade IN ('processo','lead','tarefa','solicitacao'));

-- Notifica responsável quando solicitação é atribuída (ou reatribuída)
CREATE OR REPLACE FUNCTION fn_notificar_sol_op_atribuida()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.responsavel_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.responsavel_id IS NOT DISTINCT FROM NEW.responsavel_id THEN
    RETURN NEW;
  END IF;
  INSERT INTO notificacoes (empresa_id, usuario_id, tipo, titulo, mensagem, entidade, entidade_id)
  VALUES (
    NEW.empresa_id,
    NEW.responsavel_id,
    'solicitacao_atribuida',
    'Nova solicitação atribuída a você',
    NEW.titulo,
    'solicitacao',
    NEW.id
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sol_op_atribuida
  AFTER INSERT OR UPDATE OF responsavel_id ON solicitacoes_operacionais
  FOR EACH ROW EXECUTE FUNCTION fn_notificar_sol_op_atribuida();

-- Notifica solicitante quando solicitação é concluída
CREATE OR REPLACE FUNCTION fn_notificar_sol_op_concluida()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status != 'concluido' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'concluido' THEN RETURN NEW; END IF;
  -- Não notifica se solicitante e responsável são a mesma pessoa
  IF NEW.solicitante_id IS NOT DISTINCT FROM NEW.responsavel_id THEN RETURN NEW; END IF;
  INSERT INTO notificacoes (empresa_id, usuario_id, tipo, titulo, mensagem, entidade, entidade_id)
  VALUES (
    NEW.empresa_id,
    NEW.solicitante_id,
    'solicitacao_concluida',
    'Solicitação concluída',
    NEW.titulo,
    'solicitacao',
    NEW.id
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sol_op_concluida
  AFTER UPDATE OF status ON solicitacoes_operacionais
  FOR EACH ROW EXECUTE FUNCTION fn_notificar_sol_op_concluida();
