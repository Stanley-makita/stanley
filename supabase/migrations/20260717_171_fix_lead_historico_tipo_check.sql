-- Fix: lead_historico.tipo tem um CHECK constraint (lead_historico_tipo_check)
-- desatualizado, que bloqueia silenciosamente todo valor de tipo introduzido
-- depois da migration 20260415_012_leads_correcoes.
--
-- CORREÇÃO DE DIAGNÓSTICO (importante): 20260415_012 pretendia converter a
-- coluna de TEXT+CHECK para o enum lead_historico_tipo (e removeu o CHECK
-- antigo de propósito, para não manter duas fontes de validação em paralelo).
-- Mas confirmado via introspecção direta em produção (guejtuveontfoldxytpx):
--
--   format_type(a.atttypid, a.atttypmod) = 'text'
--   pg_type.typtype                       = 'b'  (base type, NÃO 'e'/enum)
--
-- ou seja, a coluna É REALMENTE TEXT hoje em produção -- a conversão para
-- enum de 012 nunca chegou a valer nesta base (drift entre o que o repo de
-- migrations descreve e o schema real; não investigado a fundo aqui, fica
-- como item futuro). O tipo enum `lead_historico_tipo` pode existir no
-- catálogo (por causa das migrations 091/153/170 que rodam `ALTER TYPE
-- lead_historico_tipo ADD VALUE`), mas não é o tipo desta coluna -- portanto
-- NÃO oferece nenhuma validação para os valores gravados aqui.
--
-- Por isso o fix não é "remover o CHECK e confiar no enum" (isso deixaria a
-- coluna sem qualquer validação, já que ela é TEXT puro) -- é RECRIAR o CHECK
-- com a lista completa de valores realmente usados pelo código hoje.
--
-- Lista consolidada via grep em src/ (todo INSERT em lead_historico e toda
-- chamada a registrar_interacao_lead com p_tipo):
--   'criacao', 'fase_mudanca', 'edicao', 'comentario'   (lista original, migration 012)
--   'acao_operacional'                                   (20260612_091)      -- 0 linhas gravadas hoje
--   'followup_iniciado'                                  (20260713_153)      -- 0 linhas gravadas hoje
--   'followup_notificacao'                                (20260713_153)      -- 0 linhas gravadas hoje
--   'followup_resposta'                                   (20260713_153)      -- 0 linhas gravadas hoje
--   'followup_encerrado'                                  (20260713_153)      -- 0 linhas gravadas hoje
--   'workflow_log'                                        (20260625_113, usa `as any` no TS -- sinal de
--                                                           que o autor já sabia que o tipo estava fora
--                                                           de sincronia) -- 0 linhas gravadas hoje
--   'comunicacao'                                         (20260717_170, branch da Central de Comunicação
--                                                           para Leads, ainda não mergeada)
--
-- Todos os 6 valores acima (exceto o original de 012) têm 0 linhas gravadas em
-- produção -- confirma que o INSERT falha silenciosamente para cada um deles
-- desde sua introdução. Nenhum dos callers verifica o erro do insert
-- (src/lib/leads/followup.ts, src/lib/workflows/workflow-captacao.ts,
-- src/components/leads/ModalConcluirLead.tsx, src/components/leads/LeadDetalhe/AbaCredito.tsx,
-- src/app/api/leads/followup/notificar/route.ts, src/hooks/leads/useLeadChecklist.ts).
ALTER TABLE lead_historico
  DROP CONSTRAINT IF EXISTS lead_historico_tipo_check;

ALTER TABLE lead_historico
  ADD CONSTRAINT lead_historico_tipo_check CHECK (tipo IN (
    'criacao',
    'fase_mudanca',
    'edicao',
    'comentario',
    'acao_operacional',
    'followup_iniciado',
    'followup_notificacao',
    'followup_resposta',
    'followup_encerrado',
    'workflow_log',
    'comunicacao'
  ));
