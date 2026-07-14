-- ============================================================
-- Migration: 20260713_159_processo_fluxo_registro.sql
-- Fluxo Registro <-> Liberacao de Recursos: o MESMO processo troca de
-- modalidade em vez de duplicar linha. Ver useEnviarParaFluxoRegistro /
-- useEnviarParaLiberacaoRecursos.
--
-- modalidade_origem: preenchida enquanto o processo esta "visitando" o
-- fluxo Registro, guarda a modalidade de financiamento original pra saber
-- pra onde reverter. Volta a null quando retorna.
--
-- assinado_em: dedicada (nao reaproveita status_emissao, que e enum de 2
-- valores cabeado em triggers financeiros/notificacao de emissao) -- marca
-- quando o item de checklist "Contrato Assinado" e confirmado.
-- ============================================================

ALTER TABLE processos ADD COLUMN modalidade_origem modalidade_processo;
ALTER TABLE processos ADD COLUMN assinado_em TIMESTAMPTZ;
