-- Migration 153: corrige o follow-up de leads aprovados sem Processo + toggle
-- de notificação por usuário ("versão enxuta" do sistema de autorizações).
--
-- Contexto: o botão "Ainda não" no modal de Lead Concluído (ModalConcluirLead.tsx)
-- tentava criar o registro em lead_followups e o evento em lead_historico
-- direto do browser (usuário autenticado), mas isso sempre falhava por dois
-- motivos:
--   1) lead_followups tinha RLS habilitado mas nenhuma policy de INSERT/UPDATE
--      para o papel authenticated (só SELECT e ALL para service_role) — bloqueado
--      pelo Postgres, gerando o erro "Erro ao iniciar acompanhamento.".
--   2) mesmo com a policy, o INSERT em lead_historico usaria os tipos
--      'followup_iniciado'/'followup_notificacao'/'followup_resposta'/
--      'followup_encerrado', que nunca foram adicionados ao enum
--      lead_historico_tipo (só existem 'criacao','fase_mudanca','edicao',
--      'comentario','acao_operacional') — o INSERT falharia por violar o
--      enum, tanto para o client browser quanto para o cron (service_role).

-- 1) Adiciona os valores de tipo de follow-up ao enum lead_historico_tipo
ALTER TYPE lead_historico_tipo ADD VALUE IF NOT EXISTS 'followup_iniciado';
ALTER TYPE lead_historico_tipo ADD VALUE IF NOT EXISTS 'followup_notificacao';
ALTER TYPE lead_historico_tipo ADD VALUE IF NOT EXISTS 'followup_resposta';
ALTER TYPE lead_historico_tipo ADD VALUE IF NOT EXISTS 'followup_encerrado';

-- 2) Policies de INSERT/UPDATE em lead_followups para o usuário autenticado
-- (mesmo escopo por empresa já usado na policy de SELECT existente) — permite
-- que o comercial logado crie/atualize o follow-up do próprio lead ao clicar
-- "Ainda não".
CREATE POLICY "empresa_cria_followups"
  ON lead_followups FOR INSERT
  WITH CHECK (empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid()));

CREATE POLICY "empresa_atualiza_followups"
  ON lead_followups FOR UPDATE
  USING (empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid()))
  WITH CHECK (empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid()));

-- 3) Toggle de notificação por usuário — "versão enxuta" do sistema de
-- autorizações discutido: em vez de um motor de permissões completo, começa
-- com um único flag booleano por usuário, configurável em Configurações >
-- Equipe. Hoje só controla quem recebe o escalonamento de "lead aprovado sem
-- Processo há 10+ dias" (ver escalonarParaGestores em
-- src/app/api/leads/followup/notificar/route.ts) — pensado para crescer com
-- mais flags de notificação no futuro, sem precisar do projeto grande de
-- checklist de permissões por perfil ainda.
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS notificar_leads_aprovados_pendentes BOOLEAN NOT NULL DEFAULT false;
