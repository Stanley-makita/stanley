-- Persiste a resposta da consulta de restritivos diretamente no Lead.
-- Necessário porque o dialog "Consulta de Restritivos" usava apenas estado
-- local (useState), que resetava toda vez que o modal era fechado e reaberto.
-- Empresas sem checklist de tipo 'restritivos' configurado nunca tinham onde
-- salvar a resposta, fazendo o dialog reaparecer repetidamente.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS restricao_consultada boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS restricao_resultado   text;
