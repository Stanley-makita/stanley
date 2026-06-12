-- Configuração de ordem das abas do modal de lead por empresa
CREATE TABLE IF NOT EXISTS lead_aba_config (
  empresa_id  UUID PRIMARY KEY REFERENCES empresas(id) ON DELETE CASCADE,
  abas        JSONB NOT NULL DEFAULT '[]',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE lead_aba_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "empresa_propria_aba_config" ON lead_aba_config
  USING (
    empresa_id = (
      SELECT empresa_id FROM usuarios
      WHERE id = auth.uid()
      LIMIT 1
    )
  );

NOTIFY pgrst, 'reload schema';
