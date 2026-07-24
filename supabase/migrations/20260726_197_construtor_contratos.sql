-- Construtor Inteligente de Contratos — campos base pra nova tela de Negócios
-- do tipo Contrato (substitui a reutilização da tela de Financiamento).

-- tipo_contrato: coluna própria, dedicada — antes disso o formulário de criação
-- (FormContrato) armazenava o rótulo do tipo dentro de `numero_contrato`, coluna
-- que na verdade é o número sequencial real do contrato de assessoria (ver RPC
-- gerar_numero_contrato_assessoria) — abuso pré-existente, corrigido aqui.
ALTER TABLE processos
  ADD COLUMN IF NOT EXISTS tipo_contrato TEXT;

-- resumo_negociacao_json: "patrimônio" da negociação — o resumo estruturado que
-- a IA extrai de documentos+descrição e o usuário confirma na etapa
-- "Compreensão da Negociação". Persistido por versão de contrato, não é estado
-- de tela: permite reconstruir/comparar/gerar de novo sem reinterpretar do zero.
-- plano_contrato_json: a estrutura de cláusulas prevista (etapa "Plano do Contrato"),
-- confirmada antes de construir a minuta de fato.
ALTER TABLE processo_contratos
  ADD COLUMN IF NOT EXISTS resumo_negociacao_json JSONB,
  ADD COLUMN IF NOT EXISTS plano_contrato_json     JSONB;
