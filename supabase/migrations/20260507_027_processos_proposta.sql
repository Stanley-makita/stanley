-- Migration: adiciona numero_proposta à tabela processos
-- Numero de proposta gerado pelo banco (ex: Itaú, Santander)
-- Diferente do numero_processo (interno do CRM)

ALTER TABLE processos ADD COLUMN IF NOT EXISTS numero_proposta TEXT;
