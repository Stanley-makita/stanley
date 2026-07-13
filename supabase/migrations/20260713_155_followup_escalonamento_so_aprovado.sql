-- Migration 155: escalonamento do follow-up só para lead com crédito aprovado
--
-- Regra de negócio (pedido do usuário 2026-07-13):
--   - Se o lead está com status_analise = 'aprovado': continua escalonando
--     pro(s) destinatário(s) autorizados (notificar_leads_aprovados_pendentes)
--     no 10º dia sem Processo, como já funcionava.
--   - Se o lead está concluído mas NÃO aprovado (reprovado, etc.): nunca
--     escalona — só o comercial responsável continua recebendo o lembrete a
--     cada 3 dias, indefinidamente, até ele marcar o lead como perdido.
--   - Quando o lead é marcado como perdido (leads.perdido_em, migration 154),
--     o follow-up é encerrado automaticamente (para de notificar).

ALTER TABLE lead_followups
  DROP CONSTRAINT IF EXISTS lead_followups_motivo_encerramento_check;

ALTER TABLE lead_followups
  ADD CONSTRAINT lead_followups_motivo_encerramento_check
  CHECK (motivo_encerramento IN (
    'processo_criado',
    'cliente_desistiu',
    'lead_cancelado',
    'lead_arquivado',
    'perdido'
  ));
