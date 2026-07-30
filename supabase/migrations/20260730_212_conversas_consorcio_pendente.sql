-- Adiciona colunas para armazenar o fluxo pendente do *consorcio por operador.
-- Espelha custas_pendente (migration 175) — Q&A fixo e determinístico, mesmo
-- padrão de TTL (30min, controlado em consorcio-pendente.ts).

ALTER TABLE conversas
  ADD COLUMN IF NOT EXISTS consorcio_pendente        JSONB,
  ADD COLUMN IF NOT EXISTS consorcio_pendente_expira TIMESTAMPTZ;

COMMENT ON COLUMN conversas.consorcio_pendente IS
  'Estado intermediário do fluxo *consorcio aguardando resposta do operador (TTL 30min)';
COMMENT ON COLUMN conversas.consorcio_pendente_expira IS
  'Timestamp de expiração do consorcio_pendente';
