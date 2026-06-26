-- Migration 116: Adicionar rastreamento de campanha e parceiro direto em leads
-- canal:           como o lead chegou (qr_code, whatsapp, site, ...)
-- campanha:        qual campanha específica (folder_consorcio_itau, ...)
-- parceiro_id:     FK direta para o parceiro indicador (atalho; lead_parceiros cobre M:N)
-- produto_subtipo: subtipo do produto (consorcio_imobiliario, consorcio_veiculo, nao_sabe, ...)

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS canal           TEXT,
  ADD COLUMN IF NOT EXISTS campanha        TEXT,
  ADD COLUMN IF NOT EXISTS parceiro_id     UUID REFERENCES parceiros(id),
  ADD COLUMN IF NOT EXISTS produto_subtipo TEXT;

CREATE INDEX IF NOT EXISTS idx_leads_parceiro ON leads(parceiro_id)
  WHERE parceiro_id IS NOT NULL;
