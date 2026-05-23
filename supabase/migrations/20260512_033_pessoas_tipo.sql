-- Adiciona campo tipo à tabela pessoas para categorizar contatos
ALTER TABLE pessoas
  ADD COLUMN IF NOT EXISTS tipo TEXT
    CHECK (tipo IN ('cliente', 'corretor', 'parceiro', 'fornecedor', 'outro'));
