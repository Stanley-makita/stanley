-- Migration 115: Expandir tabela parceiros
-- Adiciona multi-tenância (empresa_id), vínculo à identidade (pessoa_id)
-- e papel comercial (tipo_parceiro: corretor/indicador/etc.)

ALTER TABLE parceiros
  ADD COLUMN IF NOT EXISTS empresa_id      UUID REFERENCES empresas(id),
  ADD COLUMN IF NOT EXISTS pessoa_id       UUID REFERENCES pessoas(id),
  ADD COLUMN IF NOT EXISTS tipo_parceiro   TEXT CHECK (tipo_parceiro IN (
    'corretor', 'imobiliaria', 'indicador', 'cliente_indicador', 'outro'
  )),
  ADD COLUMN IF NOT EXISTS imobiliaria     TEXT,
  ADD COLUMN IF NOT EXISTS origem_cadastro TEXT;

CREATE INDEX IF NOT EXISTS idx_parceiros_empresa        ON parceiros(empresa_id);
CREATE INDEX IF NOT EXISTS idx_parceiros_empresa_pessoa ON parceiros(empresa_id, pessoa_id);
CREATE INDEX IF NOT EXISTS idx_parceiros_empresa_cpf    ON parceiros(empresa_id, cpf_cnpj)
  WHERE cpf_cnpj IS NOT NULL;

-- RLS: parceiros ficam visíveis apenas para usuários da mesma empresa.
-- empresa_id NULL (registros legados) é permitido temporariamente.
ALTER TABLE parceiros ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'parceiros' AND policyname = 'parceiros_empresa_policy'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY parceiros_empresa_policy ON parceiros
        USING (
          empresa_id IS NULL
          OR empresa_id IN (
            SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid()
          )
        )
    $policy$;
  END IF;
END $$;
