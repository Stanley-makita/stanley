-- Adiciona tipo 'workflow_log' ao enum lead_historico_tipo.
-- Eventos técnicos do workflow (motor_executado, pdf_gerado, etc.) passam
-- a usar este tipo para não poluir o histórico comercial visível na interface.
ALTER TYPE lead_historico_tipo ADD VALUE IF NOT EXISTS 'workflow_log';
