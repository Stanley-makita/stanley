-- Participante da conversa (conversa_participantes) também deve enxergá-la na
-- lista de Conversas — hoje a RLS de SELECT não considerava isso, então
-- adicionar alguém como participante gravava a linha certinho mas não dava
-- a essa pessoa nenhuma visibilidade a mais sobre a conversa.
DROP POLICY IF EXISTS "empresa_conversas_select" ON conversas;

CREATE POLICY "empresa_conversas_select" ON conversas
  FOR SELECT USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
    AND (
      (SELECT perfil FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1) IN ('admin', 'gerente')
      OR atendente_id = (SELECT id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
      OR instancia_id IN (
        SELECT id FROM instancias WHERE atendente_id = (SELECT id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
      )
      OR id IN (
        SELECT conversa_id FROM conversa_participantes
        WHERE usuario_id = (SELECT id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
      )
      OR (atendente_id IS NULL AND instancia_id IS NULL)
    )
  );

-- Aviso de "transferida, aguardando seu atendimento" — some ao abrir a conversa.
ALTER TABLE conversas ADD COLUMN IF NOT EXISTS transferencia_pendente BOOLEAN NOT NULL DEFAULT false;
