-- Migration 202: financeiro_fechamento_processos
-- Snapshot dos processos emitidos incluídos no fechamento

CREATE TABLE IF NOT EXISTS financeiro_fechamento_processos (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fechamento_id     UUID NOT NULL REFERENCES financeiro_fechamentos(id) ON DELETE CASCADE,
  empresa_id        UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  processo_id       UUID NOT NULL REFERENCES processos(id) ON DELETE RESTRICT,
  cliente_nome      TEXT,
  banco_id          UUID REFERENCES bancos(id) ON DELETE SET NULL,
  modalidade        TEXT,
  valor_financiado  NUMERIC(15,2),
  data_emissao      DATE,
  comercial_id      UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  operacional_id    UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  status_origem     TEXT,
  incluido_manual   BOOLEAN NOT NULL DEFAULT false,
  observacoes       TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_fechamento_processo UNIQUE (fechamento_id, processo_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_fin_fp_fechamento ON financeiro_fechamento_processos(fechamento_id);
CREATE INDEX IF NOT EXISTS idx_fin_fp_empresa ON financeiro_fechamento_processos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_fin_fp_processo ON financeiro_fechamento_processos(processo_id);
CREATE INDEX IF NOT EXISTS idx_fin_fp_comercial ON financeiro_fechamento_processos(comercial_id);

-- RLS
ALTER TABLE financeiro_fechamento_processos ENABLE ROW LEVEL SECURITY;

CREATE POLICY fin_fp_select ON financeiro_fechamento_processos
  FOR SELECT USING (
    empresa_id IN (
      SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true
    )
  );

CREATE POLICY fin_fp_insert ON financeiro_fechamento_processos
  FOR INSERT WITH CHECK (
    empresa_id IN (
      SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true
    )
    AND EXISTS (
      SELECT 1 FROM financeiro_fechamentos f
      WHERE f.id = fechamento_id AND f.status != 'travado'
    )
  );

CREATE POLICY fin_fp_update ON financeiro_fechamento_processos
  FOR UPDATE USING (
    empresa_id IN (
      SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true
    )
    AND EXISTS (
      SELECT 1 FROM financeiro_fechamentos f
      WHERE f.id = fechamento_id AND f.status != 'travado'
    )
  );

CREATE POLICY fin_fp_delete ON financeiro_fechamento_processos
  FOR DELETE USING (
    empresa_id IN (
      SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true
    )
    AND EXISTS (
      SELECT 1 FROM financeiro_fechamentos f
      WHERE f.id = fechamento_id AND f.status != 'travado'
    )
  );
