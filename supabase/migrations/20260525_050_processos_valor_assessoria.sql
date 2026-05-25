-- Adiciona coluna para valor monetário da assessoria negociada com o cliente
ALTER TABLE processos ADD COLUMN IF NOT EXISTS valor_assessoria NUMERIC;
