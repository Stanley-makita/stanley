-- Fase C do Construtor de Contratos — ciclo explícito de PDF por versão.
--
-- pdf_storage_path/pdf_gerado_em: artefato de PDF gerado a partir do
-- conteudo_html da PRÓPRIA versão (linha) de processo_contratos — nunca
-- compartilhado entre versões. Só existe depois que o operador clica em
-- "Gerar/atualizar PDF"; enquanto a versão não foi enviada ao Clicksign
-- (clicksign_status ainda nulo) essa ação pode ser repetida e sobrescreve o
-- mesmo arquivo (mesmo storage_path, upsert). Depois do envio, a versão fica
-- congelada (ver regra de negócio em AbaContrato.tsx) e qualquer alteração
-- exige uma nova versão/linha, com seu próprio pdf_storage_path.
ALTER TABLE processo_contratos
  ADD COLUMN IF NOT EXISTS pdf_storage_path TEXT,
  ADD COLUMN IF NOT EXISTS pdf_gerado_em    TIMESTAMPTZ;
