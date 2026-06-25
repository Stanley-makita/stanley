-- Adiciona tipo de simulação e origem do canal à tabela central de simulações.
-- tipo_simulacao: 'preliminar' (via WhatsApp, antes da conferência documental),
--                 'revisada'  (após OCR/análise operacional),
--                 'nova'      (ajuste pontual, cliente alterou dados)
-- origem_canal:   'crm', 'whatsapp', 'portal', 'api'

ALTER TABLE simulacoes_central
  ADD COLUMN IF NOT EXISTS tipo_simulacao TEXT NOT NULL DEFAULT 'nova'
    CHECK (tipo_simulacao IN ('preliminar', 'revisada', 'nova')),
  ADD COLUMN IF NOT EXISTS origem_canal TEXT NOT NULL DEFAULT 'crm'
    CHECK (origem_canal IN ('crm', 'whatsapp', 'portal', 'api'));

COMMENT ON COLUMN simulacoes_central.tipo_simulacao IS 'Classificação: preliminar (WhatsApp/captação), revisada (pós-OCR), nova (dados alterados)';
COMMENT ON COLUMN simulacoes_central.origem_canal   IS 'Canal de origem: crm, whatsapp, portal, api';
