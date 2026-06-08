-- Tabela leve para deduplicar webhooks fromMe do *fonti (Uazapi dispara 2x por mensagem)
CREATE TABLE IF NOT EXISTS fonti_events (
  messageid TEXT PRIMARY KEY,
  empresa_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Limpeza automática após 24h (mantém tabela enxuta)
CREATE INDEX IF NOT EXISTS idx_fonti_events_created_at ON fonti_events (created_at);
