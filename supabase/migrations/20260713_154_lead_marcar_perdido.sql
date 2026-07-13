-- Migration 154: campo "Lead Perdido"
--
-- Botão "Marcar como perdido" (tela de detalhe do lead) grava o motivo como
-- uma nota comum (lead_historico, tipo 'comentario', prefixo "MOTIVO CLIENTE
-- PERDIDO - ") e marca este timestamp. Não reabre nem reativa o lead — se o
-- mesmo cliente retornar, um lead novo é criado pelo fluxo normal.
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS perdido_em TIMESTAMPTZ;
