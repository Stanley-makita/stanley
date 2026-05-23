-- Corrige policies do bucket 'documentos':
-- a policy original usava `WHERE id = auth.uid()` mas a tabela usuarios
-- usa `auth_user_id` como FK para auth.users — causando falha silenciosa em uploads.

DROP POLICY IF EXISTS "upload_documentos_empresa"   ON storage.objects;
DROP POLICY IF EXISTS "download_documentos_empresa" ON storage.objects;
DROP POLICY IF EXISTS "delete_documentos_empresa"   ON storage.objects;

CREATE POLICY "upload_documentos_empresa"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'documentos'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] IN (
      SELECT empresa_id::TEXT FROM usuarios
      WHERE auth_user_id = auth.uid() AND ativo = true
    )
  );

CREATE POLICY "download_documentos_empresa"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'documentos'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] IN (
      SELECT empresa_id::TEXT FROM usuarios
      WHERE auth_user_id = auth.uid() AND ativo = true
    )
  );

CREATE POLICY "delete_documentos_empresa"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'documentos'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] IN (
      SELECT empresa_id::TEXT FROM usuarios
      WHERE auth_user_id = auth.uid() AND ativo = true
    )
  );
