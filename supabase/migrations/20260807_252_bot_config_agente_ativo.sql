-- Chave-geral pra desligar o Agente Fonti no WhatsApp por completo, independente
-- de horário/dias configurados. Pedido explícito: o agente ainda confunde
-- documentos chegando com o fluxo normal de conversa, então até isso ser
-- aprimorado o usuário quer um jeito direto de silenciá-lo em qualquer horário
-- até religar manualmente — sem mexer na lógica de horário/produtos existente.
ALTER TABLE bot_config
  ADD COLUMN IF NOT EXISTS agente_ativo BOOLEAN NOT NULL DEFAULT TRUE;
