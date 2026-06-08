-- Adiciona 'ocr' ao CHECK constraint de origem em pessoas_alteracoes
ALTER TABLE pessoas_alteracoes
  DROP CONSTRAINT IF EXISTS pessoas_alteracoes_origem_check;

ALTER TABLE pessoas_alteracoes
  ADD CONSTRAINT pessoas_alteracoes_origem_check
  CHECK (origem IN ('leads', 'pessoas', 'processos', 'ocr'));
