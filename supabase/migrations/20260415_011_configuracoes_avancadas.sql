-- ============================================================
-- Migration: 20260415_011_configuracoes_avancadas.sql
-- Módulo: Configurações Avançadas
-- ============================================================

ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS logo_path     TEXT,
  ADD COLUMN IF NOT EXISTS email_contato TEXT,
  ADD COLUMN IF NOT EXISTS telefone_contato TEXT,
  ADD COLUMN IF NOT EXISTS site_url      TEXT;

-- FIX (Renata): WITH CHECK clause added to prevent empresa_id mutation
CREATE POLICY "admin_atualiza_empresa"
  ON empresas FOR UPDATE
  USING (
    id IN (
      SELECT empresa_id FROM usuarios
      WHERE id = auth.uid() AND perfil IN ('admin') AND ativo = true
    )
  )
  WITH CHECK (
    id IN (
      SELECT empresa_id FROM usuarios
      WHERE id = auth.uid() AND perfil IN ('admin') AND ativo = true
    )
  );

CREATE TABLE metas_equipe (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID    NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  ano             INTEGER NOT NULL,
  mes             INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  meta_valor      NUMERIC NOT NULL DEFAULT 0,
  meta_corte      NUMERIC NOT NULL DEFAULT 0,
  meta_plus       NUMERIC NOT NULL DEFAULT 0,
  meta_contratos  INTEGER NOT NULL DEFAULT 0,
  UNIQUE (empresa_id, ano, mes)
);

ALTER TABLE metas_equipe ENABLE ROW LEVEL SECURITY;

CREATE POLICY "membro_le_metas"
  ON metas_equipe FOR SELECT
  USING (
    empresa_id IN (
      SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true
    )
  );

CREATE POLICY "gestor_escreve_metas"
  ON metas_equipe FOR INSERT
  WITH CHECK (
    empresa_id IN (
      SELECT empresa_id FROM usuarios
      WHERE id = auth.uid() AND perfil IN ('admin', 'gerente') AND ativo = true
    )
  );

-- FIX (Renata): WITH CHECK added to prevent empresa_id mutation
CREATE POLICY "gestor_atualiza_metas"
  ON metas_equipe FOR UPDATE
  USING (
    empresa_id IN (
      SELECT empresa_id FROM usuarios
      WHERE id = auth.uid() AND perfil IN ('admin', 'gerente') AND ativo = true
    )
  )
  WITH CHECK (
    empresa_id IN (
      SELECT empresa_id FROM usuarios
      WHERE id = auth.uid() AND perfil IN ('admin', 'gerente') AND ativo = true
    )
  );

CREATE TABLE comissoes_padrao (
  id                  UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          UUID    NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  banco_id            UUID    NOT NULL REFERENCES bancos(id)  ON DELETE CASCADE,
  comissao_empresa    NUMERIC NOT NULL DEFAULT 0 CHECK (comissao_empresa BETWEEN 0 AND 100),
  comissao_comercial  NUMERIC NOT NULL DEFAULT 0 CHECK (comissao_comercial BETWEEN 0 AND 100),
  UNIQUE (empresa_id, banco_id)
);

ALTER TABLE comissoes_padrao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "membro_le_comissoes_padrao"
  ON comissoes_padrao FOR SELECT
  USING (
    empresa_id IN (
      SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true
    )
  );

CREATE POLICY "gestor_escreve_comissoes_padrao"
  ON comissoes_padrao FOR INSERT
  WITH CHECK (
    empresa_id IN (
      SELECT empresa_id FROM usuarios
      WHERE id = auth.uid() AND perfil IN ('admin', 'gerente') AND ativo = true
    )
  );

-- FIX (Renata): WITH CHECK added to prevent empresa_id mutation
CREATE POLICY "gestor_atualiza_comissoes_padrao"
  ON comissoes_padrao FOR UPDATE
  USING (
    empresa_id IN (
      SELECT empresa_id FROM usuarios
      WHERE id = auth.uid() AND perfil IN ('admin', 'gerente') AND ativo = true
    )
  )
  WITH CHECK (
    empresa_id IN (
      SELECT empresa_id FROM usuarios
      WHERE id = auth.uid() AND perfil IN ('admin', 'gerente') AND ativo = true
    )
  );

CREATE INDEX idx_comissoes_padrao_empresa_banco
  ON comissoes_padrao (empresa_id, banco_id);

-- Bucket logos (público):
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('logos', 'logos', true)
-- ON CONFLICT DO NOTHING;

CREATE POLICY "upload_logo_admin"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'logos'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] IN (
      SELECT empresa_id::TEXT FROM usuarios
      WHERE id = auth.uid() AND perfil = 'admin' AND ativo = true
    )
  );

CREATE POLICY "upload_logo_upsert_admin"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'logos'
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY "leitura_logo_publica"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'logos');
