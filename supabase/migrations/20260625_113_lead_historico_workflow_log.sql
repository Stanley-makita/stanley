-- Documenta o novo valor 'workflow_log' para o campo tipo em lead_historico.
-- O campo é TEXT (não ENUM), portanto nenhuma alteração estrutural é necessária.
-- Eventos técnicos do workflow usam tipo='workflow_log' e são ocultados na interface.
SELECT 1;
