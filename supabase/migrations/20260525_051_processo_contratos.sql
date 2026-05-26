-- Tabela para armazenar rascunhos de contratos gerados na aba Contrato
CREATE TABLE processo_contratos (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID        NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  processo_id     UUID        NOT NULL REFERENCES processos(id) ON DELETE CASCADE,
  tipo_modelo     TEXT        NOT NULL,
  titulo          TEXT        NOT NULL,
  conteudo_html   TEXT        NOT NULL DEFAULT '',
  criado_por      UUID        NOT NULL REFERENCES usuarios(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_contrato_por_processo UNIQUE (processo_id)
);

ALTER TABLE processo_contratos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "empresa_own_contratos" ON processo_contratos
  FOR ALL USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid())
  );

CREATE TRIGGER trg_processo_contratos_updated_at
  BEFORE UPDATE ON processo_contratos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_processo_contratos_processo ON processo_contratos(processo_id);
