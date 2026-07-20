-- Adiciona colunas para armazenar o fluxo pendente do *custas por operador.
-- Espelha simula_pendente (migration 120), mas com passo-a-passo fixo (não
-- parsing livre) já que o roteiro de perguntas do simulador de custas é
-- determinístico.

ALTER TABLE conversas
  ADD COLUMN IF NOT EXISTS custas_pendente        JSONB,
  ADD COLUMN IF NOT EXISTS custas_pendente_expira TIMESTAMPTZ;

COMMENT ON COLUMN conversas.custas_pendente IS
  'Estado intermediário do fluxo *custas aguardando resposta do operador (TTL 30min)';
COMMENT ON COLUMN conversas.custas_pendente_expira IS
  'Timestamp de expiração do custas_pendente';
