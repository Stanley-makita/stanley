-- Item 18: Herdar parceiros do Lead para o Processo.
-- Adiciona fotografia dos dados de origem/parceiro no momento da criação do processo.
-- Lead e Processo tornam-se independentes após a criação.

ALTER TABLE processos
  ADD COLUMN IF NOT EXISTS parceiro_id UUID REFERENCES parceiros(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS origem      TEXT,
  ADD COLUMN IF NOT EXISTS campanha    TEXT;

COMMENT ON COLUMN processos.parceiro_id IS
  'Parceiro herdado do Lead no momento da criação — não sincronizado após a criação';
COMMENT ON COLUMN processos.origem IS
  'Canal de origem herdado do Lead no momento da criação (whatsapp, indicacao, site…)';
COMMENT ON COLUMN processos.campanha IS
  'Campanha herdada do Lead no momento da criação';
