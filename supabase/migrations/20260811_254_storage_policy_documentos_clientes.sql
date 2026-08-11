-- ============================================================
-- Migration: 20260811_254_storage_policy_documentos_clientes.sql
-- Bucket 'documentos-clientes' nunca ganhou policies de storage.objects
-- pra escrita via usuário autenticado (migration 028 só criou a tabela e
-- deixou uma nota pra configurar manualmente no Dashboard) — só o webhook
-- do WhatsApp (service_role, ignora RLS) conseguia gravar nele. O Construtor
-- de Contratos reaproveitou esse bucket pra salvar o PDF gerado no browser
-- (usuário autenticado, sujeito a RLS) e "Atualizar PDF" falhava com "new
-- row violates row-level security policy" ao tentar fazer upload/upsert.
--
-- Mesmo padrão já corrigido pro bucket 'documentos' na migration 035
-- (usuarios.auth_user_id = auth.uid(), não usuarios.id).
-- Path usado pelos contratos: {empresa_id}/contratos/{contrato_id}.pdf
-- ============================================================

DROP POLICY IF EXISTS "upload_documentos_clientes_empresa"   ON storage.objects;
DROP POLICY IF EXISTS "update_documentos_clientes_empresa"   ON storage.objects;
DROP POLICY IF EXISTS "download_documentos_clientes_empresa" ON storage.objects;
DROP POLICY IF EXISTS "delete_documentos_clientes_empresa"   ON storage.objects;

CREATE POLICY "upload_documentos_clientes_empresa"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'documentos-clientes'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] IN (
      SELECT empresa_id::TEXT FROM usuarios
      WHERE auth_user_id = auth.uid() AND ativo = true
    )
  );

-- Necessária pro upload com upsert:true (vira INSERT ... ON CONFLICT DO
-- UPDATE quando o objeto já existe — ex: "Atualizar PDF" repetido na mesma
-- versão do contrato).
CREATE POLICY "update_documentos_clientes_empresa"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'documentos-clientes'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] IN (
      SELECT empresa_id::TEXT FROM usuarios
      WHERE auth_user_id = auth.uid() AND ativo = true
    )
  )
  WITH CHECK (
    bucket_id = 'documentos-clientes'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] IN (
      SELECT empresa_id::TEXT FROM usuarios
      WHERE auth_user_id = auth.uid() AND ativo = true
    )
  );

CREATE POLICY "download_documentos_clientes_empresa"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'documentos-clientes'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] IN (
      SELECT empresa_id::TEXT FROM usuarios
      WHERE auth_user_id = auth.uid() AND ativo = true
    )
  );

CREATE POLICY "delete_documentos_clientes_empresa"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'documentos-clientes'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] IN (
      SELECT empresa_id::TEXT FROM usuarios
      WHERE auth_user_id = auth.uid() AND ativo = true
    )
  );
