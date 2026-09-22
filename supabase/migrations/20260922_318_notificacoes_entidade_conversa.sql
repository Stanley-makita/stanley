-- Migration 318 — notificacoes.entidade ganha 'conversa' (Fase 4 do plano de
-- push/PWA: deep-link de "nova mensagem" pra /conversas?id=<conversaId>).
--
-- Aproveitando a mesma linha, corrige um gap achado nesta investigação:
-- 'lead_tarefa' tinha sido adicionado ao CHECK pela migration
-- 20260630_140_notificacao_lead_tarefa.sql, mas a migration
-- 20260817_258_agenda_compromissos.sql reescreveu a lista inteira do zero
-- (pra acrescentar 'compromisso') sem reaproveitar 'lead_tarefa' — perdido
-- sem querer, não relacionado a push. O trigger `fn_notificar_lead_tarefa_atribuida`
-- continuava inserindo `entidade = 'lead_tarefa'` normalmente (a tabela não tinha
-- essa proteção há tempos), então isso nunca falhou visivelmente, só deixou de
-- barrar um valor que deveria ser validado.

ALTER TABLE notificacoes DROP CONSTRAINT IF EXISTS notificacoes_entidade_check;
ALTER TABLE notificacoes
  ADD CONSTRAINT notificacoes_entidade_check
  CHECK (entidade IN ('processo', 'lead', 'tarefa', 'lead_tarefa', 'solicitacao', 'compromisso', 'conversa'));
