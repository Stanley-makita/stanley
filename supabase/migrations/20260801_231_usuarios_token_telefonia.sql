-- Fase 3 do plano de Conversas (identificação de chamada via MicroSIP):
-- token fixo por usuário, usado pelo cmdIncomingCall do MicroSIP (rodando na
-- máquina do operacional) pra identificar de quem é a chamada que chegou,
-- ao chamar POST/GET /api/telefonia/chamada-recebida?token=...&numero=...
-- Gerado automaticamente (gen_random_uuid) pra cada usuário existente e novo
-- — não precisa digitar nada, só copiar da tela de edição do usuário.

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS token_telefonia UUID DEFAULT gen_random_uuid();

UPDATE usuarios SET token_telefonia = gen_random_uuid() WHERE token_telefonia IS NULL;

ALTER TABLE usuarios ALTER COLUMN token_telefonia SET NOT NULL;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_token_telefonia_key UNIQUE (token_telefonia);

NOTIFY pgrst, 'reload schema';
