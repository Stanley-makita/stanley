-- Comissão Jurídico para negócios do módulo Contrato — coluna criada agora
-- para aparecer na Tabela de Contratos; UI de edição fica para uma etapa
-- futura (por ora sempre null/"—").
ALTER TABLE processos ADD COLUMN IF NOT EXISTS comissao_juridico NUMERIC(5,2);
