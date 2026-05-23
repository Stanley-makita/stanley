-- Migration: suporte a conversas de grupo WhatsApp

ALTER TABLE conversas
  ADD COLUMN IF NOT EXISTS contato_grupo_id TEXT;
-- chatid do grupo ex: "120363234567890123@g.us"
-- NULL para mensagens diretas (1:1)

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversas_grupo_empresa
  ON conversas(empresa_id, contato_grupo_id)
  WHERE contato_grupo_id IS NOT NULL;
-- Garante que o mesmo grupo gera apenas UMA conversa por empresa,
-- evitando duplicatas quando múltiplas instâncias estão no mesmo grupo.
