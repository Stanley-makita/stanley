-- Adiciona taxa de juros negociada ao processo (ex: 11.29 = 11,29% a.a.)
ALTER TABLE processos
  ADD COLUMN IF NOT EXISTS taxa_juros NUMERIC(6,4);
