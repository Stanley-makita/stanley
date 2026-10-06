-- Instagram deixa de criar Lead automaticamente: toda DM entra só como
-- Conversa e quem atende decide se vira Lead (botão "Vincular lead" na tela de
-- Conversas). Antes, qualquer "parabéns"/emoji virava Lead em Captação.
--
-- 1. canais_leads_config.instagram_atendentes: usuários que recebem o aviso
--    (sino + toast + push) de mensagem do Instagram em conversa que ainda não
--    tem dono. Lista vazia = avisa admin/gestor ativos (nenhuma mensagem fica
--    sem ninguém avisado).
-- 2. conversas.responsavel_avisos_id: quem "pegou" a conversa (respondeu pelo
--    Fonti ou criou/vinculou o Lead). A partir daí só essa pessoa é avisada.
--    NÃO é atendente_id de propósito: atendente_id restringe a visibilidade
--    da conversa pela RLS (empresa_conversas_select) — os outros deixariam de
--    ver a conversa. Esta coluna só decide quem recebe aviso.

ALTER TABLE canais_leads_config
  ADD COLUMN IF NOT EXISTS instagram_atendentes UUID[] NOT NULL DEFAULT '{}';

ALTER TABLE conversas
  ADD COLUMN IF NOT EXISTS responsavel_avisos_id UUID REFERENCES usuarios(id) ON DELETE SET NULL;

-- 3. Conversas do Instagram presas a lead já excluído (soft delete) ficam livres
--    pra vincular/criar outro lead. Daqui pra frente a exclusão do lead
--    (DELETE /api/leads/[id]) já desvincula as conversas.
UPDATE conversas c
   SET lead_id = NULL
  FROM leads l
 WHERE c.lead_id = l.id
   AND c.canal = 'instagram'
   AND l.deleted_at IS NOT NULL;

-- 4. Conversas do Instagram já ligadas a um lead com responsável: esse
--    responsável passa a ser o dono dos avisos.
UPDATE conversas c
   SET responsavel_avisos_id = l.responsavel_id
  FROM leads l
 WHERE c.lead_id = l.id
   AND c.canal = 'instagram'
   AND c.responsavel_avisos_id IS NULL
   AND l.responsavel_id IS NOT NULL
   AND l.deleted_at IS NULL;
