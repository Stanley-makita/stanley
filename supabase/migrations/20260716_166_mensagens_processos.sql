-- Central de Comunicação com o Cliente (Fase 1). Vincula uma mensagem de WhatsApp ao Negócio
-- (processo) que a originou, sem tocar em `mensagens`/`conversas` — uma Pessoa pode ter mais
-- de um Negócio ao longo do tempo, então o vínculo por pessoa/telefone sozinho não isola qual
-- negócio gerou aquele envio especificamente. Tabela de junção própria preserva a
-- independência entre Conversa e Negócio.
--
-- `envio_id UNIQUE` também é o mecanismo de idempotência do envio manual: o frontend gera essa
-- chave uma única vez por clique, e o backend faz um INSERT atômico aqui *antes* de chamar a
-- Uazapi — se colidir, é retry/clique duplicado, não reenvia. Mecanismo simples e totalmente
-- separado de `fonti_events` (que continua exclusiva da idempotência do webhook recebido).
CREATE TABLE IF NOT EXISTS mensagens_processos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  processo_id UUID NOT NULL REFERENCES processos(id) ON DELETE CASCADE,
  -- Nulo até o envio à Uazapi confirmar e a linha em `mensagens` existir.
  mensagem_id UUID REFERENCES mensagens(id) ON DELETE SET NULL,
  envio_id    UUID NOT NULL UNIQUE,
  usuario_id  UUID NOT NULL REFERENCES usuarios(id),
  status      TEXT NOT NULL DEFAULT 'enviando' CHECK (status IN ('enviando', 'enviado', 'falhou')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_msg_proc_processo ON mensagens_processos(processo_id);
CREATE INDEX IF NOT EXISTS idx_msg_proc_empresa   ON mensagens_processos(empresa_id);

ALTER TABLE mensagens_processos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mensagens_processos_select" ON mensagens_processos
  FOR SELECT USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
  );

CREATE POLICY "mensagens_processos_insert" ON mensagens_processos
  FOR INSERT WITH CHECK (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
  );

CREATE POLICY "mensagens_processos_update" ON mensagens_processos
  FOR UPDATE USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
  );

-- Service role bypass — o endpoint de envio roda com a chave de serviço, igual ao webhook.
CREATE POLICY "service_mensagens_processos_all" ON mensagens_processos
  FOR ALL USING (auth.role() = 'service_role');
