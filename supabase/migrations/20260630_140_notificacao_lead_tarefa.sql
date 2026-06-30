-- ============================================================
-- Migration: 20260630_140_notificacao_lead_tarefa.sql
-- Item 20 — Sistema Central de Notificações: cobertura de lead_tarefas
-- Espelha fn_notificar_tarefa_atribuida (processo_tarefas), reaproveitando
-- a mesma tabela/tipo/pipeline de notificações (sem sistema paralelo).
-- ============================================================

ALTER TABLE notificacoes DROP CONSTRAINT IF EXISTS notificacoes_entidade_check;
ALTER TABLE notificacoes
  ADD CONSTRAINT notificacoes_entidade_check
  CHECK (entidade IN ('processo', 'lead', 'tarefa', 'lead_tarefa', 'solicitacao'));

CREATE OR REPLACE FUNCTION fn_notificar_lead_tarefa_atribuida()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_titulo_tarefa TEXT;
BEGIN
  IF NEW.responsavel_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.responsavel_id IS NOT DISTINCT FROM NEW.responsavel_id THEN
    RETURN NEW;
  END IF;
  IF NEW.responsavel_id IS NOT DISTINCT FROM NEW.criado_por THEN
    RETURN NEW;
  END IF;

  v_titulo_tarefa := COALESCE(NEW.titulo, 'Nova tarefa');

  INSERT INTO notificacoes (empresa_id, usuario_id, tipo, titulo, mensagem, entidade, entidade_id)
  VALUES (
    NEW.empresa_id,
    NEW.responsavel_id,
    'tarefa_atribuida',
    'Tarefa atribuída a você',
    v_titulo_tarefa,
    'lead_tarefa',
    NEW.id
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notificar_lead_tarefa_atribuida
  AFTER INSERT OR UPDATE OF responsavel_id ON lead_tarefas
  FOR EACH ROW EXECUTE FUNCTION fn_notificar_lead_tarefa_atribuida();
