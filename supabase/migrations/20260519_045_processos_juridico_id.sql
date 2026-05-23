-- Adiciona juridico_id em processos para o bloco Responsáveis
-- (Contrato exige Jurídico obrigatório; Financiamento/CGI opcional)

ALTER TABLE processos
  ADD COLUMN IF NOT EXISTS juridico_id UUID REFERENCES usuarios(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_processos_juridico_id ON processos(juridico_id);
