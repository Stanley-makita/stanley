-- Adiciona campo modalidades ao cadastro de produtos
-- Armazena quais modalidades de processo pertencem a cada produto
ALTER TABLE produtos
  ADD COLUMN IF NOT EXISTS modalidades text[] NOT NULL DEFAULT '{}';
