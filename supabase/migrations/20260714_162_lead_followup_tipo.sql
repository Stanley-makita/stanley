-- Follow-up de lead ganha um "tipo" para distinguir o acompanhamento de credito
-- aprovado (padrao ate aqui, intervalo de 3 dias) do acompanhamento de credito
-- recusado que pode reverter (intervalo mais espacado, 10 dias, sem escalonar
-- para gestores).

ALTER TABLE lead_followups
  ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'aprovado_pendente'
    CHECK (tipo IN ('aprovado_pendente', 'recusado_retry')),
  ADD COLUMN IF NOT EXISTS intervalo_dias INTEGER NOT NULL DEFAULT 3;

-- Amplia motivo_encerramento para cobrir reversao de status (ex: recusado
-- volta a ficar aprovado numa nova analise, encerrando o followup antigo).
ALTER TABLE lead_followups DROP CONSTRAINT IF EXISTS lead_followups_motivo_encerramento_check;
ALTER TABLE lead_followups ADD CONSTRAINT lead_followups_motivo_encerramento_check
  CHECK (motivo_encerramento IN (
    'processo_criado', 'cliente_desistiu', 'lead_cancelado', 'lead_arquivado', 'situacao_revertida'
  ));
