-- "Alerta em" na cota de Consórcio — data estimada de contemplação. Quando
-- essa data chega, um cron dispara notificação in-app + WhatsApp pro
-- comercial responsável pelo Negócio (ver /api/cotas/alerta-contemplacao).
-- alerta_enviado_em marca quando o alerta já foi disparado, pra não repetir
-- no dia seguinte (dispara uma vez só).

ALTER TABLE processo_cotas ADD COLUMN IF NOT EXISTS alerta_em DATE;
ALTER TABLE processo_cotas ADD COLUMN IF NOT EXISTS alerta_enviado_em TIMESTAMPTZ;
