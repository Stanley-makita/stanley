-- Migration 238: Fix — GRANT EXECUTE faltando nas funções novas da migration 237
--
-- Este projeto revoga a permissão padrão de execução de funções novas (todo
-- RPC precisa de GRANT EXECUTE ... TO authenticated explícito — ver padrão em
-- outras migrations, ex. 20260625_114_dashboard_kpis_function.sql). As
-- funções recriadas via CREATE OR REPLACE na 235/237 mantiveram a permissão
-- de antes, mas as funções NOVAS da 237 nunca ganharam essa concessão —
-- causando erro de permissão ao chamar via PostgREST (computed columns
-- comissao_comercial_calculada/comissao_empresa_calculada incluídas, o que
-- quebrava a listagem inteira de Negócios > Financiamento).

GRANT EXECUTE ON FUNCTION calcular_producao_comercial_mes(UUID, UUID, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION comissao_comercial_calculada(processos) TO authenticated;
GRANT EXECUTE ON FUNCTION comissao_empresa_calculada(processos) TO authenticated;
GRANT EXECUTE ON FUNCTION contas_a_receber_mes_preview(UUID, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION comissoes_a_pagar_mes_preview(UUID, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION preparar_fechamento(UUID) TO authenticated;
