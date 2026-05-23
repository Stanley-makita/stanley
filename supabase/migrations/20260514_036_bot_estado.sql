-- Adiciona estado do bot e dados coletados à tabela conversas.
-- Implementa state machine determinística para evitar loops de coleta de dados.

ALTER TABLE conversas
  ADD COLUMN IF NOT EXISTS bot_estado TEXT NOT NULL DEFAULT 'INICIO'
    CHECK (bot_estado IN ('INICIO', 'COLETANDO_DADOS', 'CONFIRMANDO', 'CONCLUIDO')),
  ADD COLUMN IF NOT EXISTS bot_dados JSONB NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_conversas_bot_estado
  ON conversas(empresa_id, bot_estado)
  WHERE bot_estado != 'CONCLUIDO';
