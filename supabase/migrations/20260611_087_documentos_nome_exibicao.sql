-- Adiciona campo para nome personalizado pelo operador no CRM.
-- nome_original permanece imutável (nome recebido no upload/WhatsApp).
-- A UI exibe: nome_exibicao ?? nome_original.
ALTER TABLE documentos_clientes
  ADD COLUMN IF NOT EXISTS nome_exibicao TEXT;
