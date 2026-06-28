-- Adiciona colunas para armazenar workflow pendente do *simula por operador.
-- Usado para continuar uma simulação quando o operador responde a uma pergunta
-- do Fonti sem repetir o comando *simula.

ALTER TABLE conversas
  ADD COLUMN IF NOT EXISTS simula_pendente        JSONB,
  ADD COLUMN IF NOT EXISTS simula_pendente_expira TIMESTAMPTZ;

COMMENT ON COLUMN conversas.simula_pendente IS
  'Estado intermediário de workflow *simula aguardando resposta do operador (TTL 30min)';
COMMENT ON COLUMN conversas.simula_pendente_expira IS
  'Timestamp de expiração do simula_pendente';
