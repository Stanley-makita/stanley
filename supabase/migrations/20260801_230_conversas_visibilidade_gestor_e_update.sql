-- Fase 1 do plano de Conversas (visibilidade + transferência):
--
-- 1) A policy de SELECT mais recente (20260724_196) só libera "ver todas as
--    conversas" pra admin/gerente — gestor ficou de fora por engano (o
--    restante do sistema trata gestor como perfil de gestão equivalente a
--    admin/gerente pra esse tipo de coisa). Adiciona gestor à lista. Confirma
--    também que operacional/apoio/jurídico já NÃO tinham essa visão geral
--    (achado real: a suposição inicial era que tinham, baseada numa migration
--    mais antiga já superada — a 196 já era mais restritiva que isso).
--
-- 2) A policy de UPDATE nunca mudou desde a criação da tabela (20260504_018)
--    — só checa empresa_id, sem nenhuma restrição de dono. Isso significa que
--    hoje qualquer usuário autenticado da empresa consegue, via chamada
--    direta ao Supabase (fora da tela), reatribuir (transferir) qualquer
--    conversa pra qualquer atendente, mesmo sem ter nenhuma relação com ela.
--    A tela já esconde o botão "Transferir" com base na permissão
--    `conversas.transferir` (hoje liberada pra todo perfil, de propósito —
--    não muda aqui), mas o banco não reforçava isso. Corrige exigindo que só
--    quem já enxergaria a conversa (dono atual, admin/gerente/gestor, dono
--    da instância, ou participante interno) consiga fazer qualquer UPDATE
--    nela — mesma regra da visibilidade de SELECT.

DROP POLICY IF EXISTS "empresa_conversas_select" ON conversas;
CREATE POLICY "empresa_conversas_select" ON conversas
  FOR SELECT USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
    AND (
      (SELECT perfil FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1) IN ('admin', 'gerente', 'gestor')
      OR atendente_id = (SELECT id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
      OR instancia_id IN (
        SELECT id FROM instancias WHERE atendente_id = (SELECT id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
      )
      OR id IN (
        SELECT conversa_id FROM conversa_participantes
        WHERE usuario_id = (SELECT id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
      )
      OR (atendente_id IS NULL AND instancia_id IS NULL)
    )
  );

DROP POLICY IF EXISTS "empresa_conversas_update" ON conversas;
CREATE POLICY "empresa_conversas_update" ON conversas
  FOR UPDATE
  USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
    AND (
      (SELECT perfil FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1) IN ('admin', 'gerente', 'gestor')
      OR atendente_id = (SELECT id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
      OR instancia_id IN (
        SELECT id FROM instancias WHERE atendente_id = (SELECT id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
      )
      OR id IN (
        SELECT conversa_id FROM conversa_participantes
        WHERE usuario_id = (SELECT id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
      )
      OR (atendente_id IS NULL AND instancia_id IS NULL)
    )
  )
  WITH CHECK (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
  );

NOTIFY pgrst, 'reload schema';
