-- Participantes internos numa conversa (alem do atendente_id responsavel) e
-- atribuicao de qual usuario enviou cada mensagem.

CREATE TABLE conversa_participantes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id    UUID NOT NULL REFERENCES conversas(id) ON DELETE CASCADE,
  usuario_id     UUID NOT NULL REFERENCES usuarios(id),
  empresa_id     UUID NOT NULL REFERENCES empresas(id),
  adicionado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  adicionado_por UUID REFERENCES usuarios(id),
  UNIQUE (conversa_id, usuario_id)
);

ALTER TABLE conversa_participantes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conversa_participantes_select" ON conversa_participantes
  FOR SELECT USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
  );

CREATE POLICY "conversa_participantes_insert" ON conversa_participantes
  FOR INSERT WITH CHECK (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
  );

CREATE POLICY "conversa_participantes_delete" ON conversa_participantes
  FOR DELETE USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
  );

CREATE POLICY "service_conversa_participantes_all" ON conversa_participantes
  FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX idx_conversa_participantes_conversa ON conversa_participantes (conversa_id);

ALTER TABLE mensagens ADD COLUMN IF NOT EXISTS usuario_id UUID REFERENCES usuarios(id);
