-- Adiciona 'consulta' ao CHECK de tipo_simulacao em simulacoes_central.
-- 'consulta' = simulação rápida via *simula (WhatsApp), sem criar Lead/Pessoa.

-- O constraint foi criado com ADD COLUMN ... CHECK em migration 109,
-- então o Postgres gerou um nome automático. Removemos pelo nome gerado
-- (simulacoes_central_tipo_simulacao_check) e recriamos incluindo 'consulta'.
-- Se o nome diferir, ajustar abaixo conforme \d simulacoes_central no SQL Editor.

ALTER TABLE simulacoes_central
  DROP CONSTRAINT IF EXISTS simulacoes_central_tipo_simulacao_check;

ALTER TABLE simulacoes_central
  ALTER COLUMN tipo_simulacao DROP DEFAULT;

ALTER TABLE simulacoes_central
  ADD CONSTRAINT simulacoes_central_tipo_simulacao_check
  CHECK (tipo_simulacao IN ('preliminar', 'revisada', 'nova', 'consulta'));

ALTER TABLE simulacoes_central
  ALTER COLUMN tipo_simulacao SET DEFAULT 'nova';

COMMENT ON COLUMN simulacoes_central.tipo_simulacao IS
  'Classificação: preliminar (WhatsApp/captação), revisada (pós-OCR), nova (dados alterados), consulta (rápida via *simula, sem Lead)';
