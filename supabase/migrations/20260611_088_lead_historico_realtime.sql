-- Habilita Supabase Realtime na tabela lead_historico para que
-- a aba Notas atualize automaticamente para todos os usuários com o lead aberto.
-- REPLICA IDENTITY FULL é necessário para que o filtro por lead_id funcione
-- corretamente no Postgres Changes do Realtime.
ALTER TABLE lead_historico REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE lead_historico;
