-- Rastreio de envio de PDF em simulacoes_central.
-- Usado pelo Workflow de Consulta Comercial (*simula), que não tem lead_id
-- e portanto não pode registrar erros no lead_historico.

ALTER TABLE simulacoes_central
  ADD COLUMN IF NOT EXISTS pdf_status    TEXT         CHECK (pdf_status IN ('enviado', 'erro', 'nao_gerado')),
  ADD COLUMN IF NOT EXISTS pdf_erro      TEXT,
  ADD COLUMN IF NOT EXISTS pdf_enviado_em TIMESTAMPTZ;

COMMENT ON COLUMN simulacoes_central.pdf_status     IS 'Status do envio do PDF: enviado, erro, nao_gerado';
COMMENT ON COLUMN simulacoes_central.pdf_erro       IS 'Mensagem técnica do erro de PDF (quando pdf_status = erro)';
COMMENT ON COLUMN simulacoes_central.pdf_enviado_em IS 'Timestamp do envio bem-sucedido do PDF';
