-- Migration 085: tabela apuracoes_renda
-- Armazena análises de extratos bancários geradas pelo Claude Sonnet.
-- Cada análise é um registro imutável — re-análise cria novo registro (histórico completo).

CREATE TABLE IF NOT EXISTS apuracoes_renda (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id              UUID        NOT NULL REFERENCES empresas(id),
  lead_id                 UUID        REFERENCES leads(id) ON DELETE CASCADE,
  processo_id             UUID        REFERENCES processos(id) ON DELETE CASCADE,
  usuario_id              UUID        REFERENCES usuarios(id) ON DELETE SET NULL,

  -- Métricas extraídas do resultado_json para queries rápidas
  renda_apurada           NUMERIC(12,2),
  media_mensal_entradas   NUMERIC(12,2),
  media_mensal_saidas     NUMERIC(12,2),
  media_liquida           NUMERIC(12,2),
  periodo_inicio          TEXT,                  -- ex: "2025-09"
  periodo_fim             TEXT,                  -- ex: "2025-12"
  documentos_ids          UUID[],                -- ids dos documentos_clientes analisados

  confianca               TEXT        CHECK (confianca IN ('alta', 'media', 'baixa')),
  status                  TEXT        NOT NULL DEFAULT 'concluida'
                                      CHECK (status IN ('pendente', 'concluida', 'revisada', 'descartada')),

  resultado_json          JSONB       NOT NULL,  -- análise completa: meses, lançamentos, identificações, alertas

  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON apuracoes_renda(lead_id, created_at DESC);
CREATE INDEX ON apuracoes_renda(processo_id, created_at DESC);
CREATE INDEX ON apuracoes_renda(empresa_id);

ALTER TABLE apuracoes_renda ENABLE ROW LEVEL SECURITY;

CREATE POLICY "empresa_acessa_apuracoes_renda" ON apuracoes_renda
  FOR ALL
  USING (
    empresa_id = (
      SELECT empresa_id FROM usuarios
      WHERE auth_user_id = auth.uid()
      LIMIT 1
    )
  );
