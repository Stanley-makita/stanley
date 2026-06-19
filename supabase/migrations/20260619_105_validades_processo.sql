-- Controle de validades por processo: crédito, engenharia e matrícula

ALTER TABLE processos
  ADD COLUMN IF NOT EXISTS validade_credito    DATE,
  ADD COLUMN IF NOT EXISTS validade_engenharia DATE,
  ADD COLUMN IF NOT EXISTS validade_matricula  DATE;

-- Tabela de reconhecimento de alertas por usuário
-- Garante que cada usuário confirme cada alerta de forma independente.
-- A coluna validade_data invalida o ack se a data for alterada.
CREATE TABLE IF NOT EXISTS processo_alertas_lidos (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  processo_id   UUID        NOT NULL REFERENCES processos(id)  ON DELETE CASCADE,
  usuario_id    UUID        NOT NULL REFERENCES usuarios(id)   ON DELETE CASCADE,
  tipo          TEXT        NOT NULL,
  validade_data DATE        NOT NULL,
  lido_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (processo_id, usuario_id, tipo, validade_data)
);

ALTER TABLE processo_alertas_lidos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "usuario ve proprios alertas"
  ON processo_alertas_lidos
  FOR ALL
  USING (usuario_id = auth.uid());
