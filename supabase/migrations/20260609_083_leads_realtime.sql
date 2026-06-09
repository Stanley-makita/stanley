-- Habilita real-time para a tabela leads
-- Necessário para que o Kanban atualize automaticamente sem F5

ALTER PUBLICATION supabase_realtime ADD TABLE leads;
