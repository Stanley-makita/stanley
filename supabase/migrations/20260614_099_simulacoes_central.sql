-- Central de Simulações: histórico unificado de simulações de custas e financiamento

CREATE TABLE IF NOT EXISTS simulacoes_central (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     UUID          NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  tipo           TEXT          NOT NULL CHECK (tipo IN ('custas', 'financiamento')),
  status         TEXT          NOT NULL DEFAULT 'concluida' CHECK (status IN ('aguardando', 'concluida')),
  nome_cliente   TEXT,
  cpf_cliente    TEXT,
  banco          TEXT,
  responsavel_id UUID          REFERENCES usuarios(id) ON DELETE SET NULL,
  resultado_json JSONB,
  lead_id        UUID          REFERENCES leads(id) ON DELETE SET NULL,
  processo_id    UUID          REFERENCES processos(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_simcentral_empresa   ON simulacoes_central(empresa_id);
CREATE INDEX IF NOT EXISTS idx_simcentral_tipo      ON simulacoes_central(tipo);
CREATE INDEX IF NOT EXISTS idx_simcentral_created   ON simulacoes_central(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_simcentral_lead      ON simulacoes_central(lead_id);
CREATE INDEX IF NOT EXISTS idx_simcentral_processo  ON simulacoes_central(processo_id);

ALTER TABLE simulacoes_central ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sc_select" ON simulacoes_central;
DROP POLICY IF EXISTS "sc_insert" ON simulacoes_central;
DROP POLICY IF EXISTS "sc_update" ON simulacoes_central;

CREATE POLICY "sc_select" ON simulacoes_central
  FOR SELECT USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid())
  );

CREATE POLICY "sc_insert" ON simulacoes_central
  FOR INSERT WITH CHECK (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid())
  );

CREATE POLICY "sc_update" ON simulacoes_central
  FOR UPDATE USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid())
  );
