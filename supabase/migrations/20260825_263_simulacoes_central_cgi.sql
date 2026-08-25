-- Permite tipo='cgi' em simulacoes_central (Central de Simulações / CGI Home Equity).
-- Mesmo padrão de 20260729_211_simulacoes_central_consorcio.sql (quando Consórcio foi adicionado).
ALTER TABLE simulacoes_central DROP CONSTRAINT IF EXISTS simulacoes_central_tipo_check;
ALTER TABLE simulacoes_central ADD CONSTRAINT simulacoes_central_tipo_check
  CHECK (tipo IN ('custas', 'financiamento', 'consorcio', 'cgi'));

-- Reclassifica simulações de CGI gravadas erradas pelo bot antes desta migration
-- (workflow-cgi.ts usava tipo:'financiamento' + resultado_json.produto:'CGI' como
-- diferenciador informal, único jeito de passar pelo CHECK constraint antigo).
UPDATE simulacoes_central
SET tipo = 'cgi'
WHERE tipo = 'financiamento' AND resultado_json ->> 'produto' = 'CGI';
