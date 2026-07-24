-- Marca até quando cada usuário já leu as notas internas de uma conversa,
-- usado para badge de "nota nova" no botão Notas da tela de Conversas.
CREATE TABLE IF NOT EXISTS notas_internas_leituras (
  conversa_id  UUID NOT NULL REFERENCES conversas(id) ON DELETE CASCADE,
  usuario_id   UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  lido_ate     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conversa_id, usuario_id)
);

ALTER TABLE notas_internas_leituras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notas_internas_leituras_select" ON notas_internas_leituras
  FOR SELECT USING (
    usuario_id = (SELECT id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
  );

CREATE POLICY "notas_internas_leituras_upsert" ON notas_internas_leituras
  FOR INSERT WITH CHECK (
    usuario_id = (SELECT id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
  );

CREATE POLICY "notas_internas_leituras_update" ON notas_internas_leituras
  FOR UPDATE USING (
    usuario_id = (SELECT id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
  );

CREATE POLICY "service_notas_internas_leituras_all" ON notas_internas_leituras
  FOR ALL USING (auth.role() = 'service_role');
