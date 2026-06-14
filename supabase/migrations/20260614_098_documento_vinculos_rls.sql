ALTER TABLE documento_processo_vinculos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "empresa_acessa_documento_processo_vinculos" ON documento_processo_vinculos
  FOR ALL
  USING (
    empresa_id = (
      SELECT empresa_id FROM usuarios
      WHERE auth_user_id = auth.uid()
      LIMIT 1
    )
  );
