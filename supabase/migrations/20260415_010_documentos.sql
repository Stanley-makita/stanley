-- ============================================================
-- Migration: 20260415_010_documentos.sql
-- Módulo: Documentos
-- ============================================================

CREATE TABLE processo_documentos (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   UUID        NOT NULL REFERENCES empresas(id)  ON DELETE CASCADE,
  processo_id  UUID        NOT NULL REFERENCES processos(id) ON DELETE CASCADE,
  nome         TEXT        NOT NULL,
  storage_path TEXT        NOT NULL,
  tamanho      BIGINT,
  mime_type    TEXT,
  enviado_por  UUID        NOT NULL REFERENCES usuarios(id),
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE processo_documentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "membro_le_documentos"
  ON processo_documentos FOR SELECT
  USING (
    empresa_id IN (
      SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true
    )
  );

CREATE POLICY "membro_insere_documento"
  ON processo_documentos FOR INSERT
  WITH CHECK (
    empresa_id IN (
      SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true
    )
    AND enviado_por = auth.uid()
  );

-- FIX (Renata): delete table row BEFORE Storage to avoid orphaned records
CREATE POLICY "membro_exclui_proprio_ou_gestor"
  ON processo_documentos FOR DELETE
  USING (
    enviado_por = auth.uid()
    OR EXISTS (
      SELECT 1 FROM usuarios
      WHERE id = auth.uid()
        AND empresa_id = processo_documentos.empresa_id
        AND perfil IN ('admin', 'gerente')
        AND ativo = true
    )
  );

CREATE INDEX idx_proc_docs_processo ON processo_documentos (processo_id, criado_em DESC);
CREATE INDEX idx_proc_docs_empresa  ON processo_documentos (empresa_id);

-- Bucket criação (descomente se ambiente suportar):
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('documentos', 'documentos', false)
-- ON CONFLICT DO NOTHING;

-- Storage Policies para bucket documentos (path: {empresa_id}/{processo_id}/{arquivo})
CREATE POLICY "upload_documentos_empresa"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'documentos'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] IN (
      SELECT empresa_id::TEXT FROM usuarios
      WHERE id = auth.uid() AND ativo = true
    )
  );

CREATE POLICY "download_documentos_empresa"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'documentos'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] IN (
      SELECT empresa_id::TEXT FROM usuarios
      WHERE id = auth.uid() AND ativo = true
    )
  );

CREATE POLICY "delete_documentos_empresa"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'documentos'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] IN (
      SELECT empresa_id::TEXT FROM usuarios
      WHERE id = auth.uid() AND ativo = true
    )
  );
