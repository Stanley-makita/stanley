-- Corrige exposição de segurança: a RLS de `instancias` (números WhatsApp)
-- não checava perfil nenhum em SELECT/INSERT/UPDATE — qualquer usuário ativo
-- da empresa conseguia ler o `token` completo de integração com a Uazapi
-- (a UI só mascara visualmente o token, o dado cru chega inteiro no client)
-- e, em tese, criar/editar instâncias, apesar de `instancias.gerenciar` já
-- estar rotulada "só admin" (MOTIVO_SOMENTE_ADMIN) no catálogo de permissões
-- da aplicação — a tela sempre escondeu o botão de gerenciar pra quem não é
-- admin, mas isso era só cosmético, sem nada no banco reforçando.
--
-- Restringe a admin, hardcoded (fechamento do buraco de segurança — ainda
-- não é a versão "configurável por perfil", que é um projeto à parte).

DROP POLICY IF EXISTS "instancias_select" ON instancias;
CREATE POLICY "instancias_select" ON instancias
  FOR SELECT USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
    AND (SELECT perfil FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1) = 'admin'
  );

DROP POLICY IF EXISTS "instancias_insert" ON instancias;
CREATE POLICY "instancias_insert" ON instancias
  FOR INSERT WITH CHECK (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
    AND (SELECT perfil FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1) = 'admin'
  );

DROP POLICY IF EXISTS "instancias_update" ON instancias;
CREATE POLICY "instancias_update" ON instancias
  FOR UPDATE USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
    AND (SELECT perfil FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1) = 'admin'
  );

-- RLS é por linha, não por coluna — não dá pra "esconder só o token" com uma
-- policy. Quem não é admin continua precisando filtrar Conversas e o
-- dashboard de Gestão por instância; esta função devolve só as colunas
-- não-sensíveis (nunca faz SELECT * internamente, então não existe caminho
-- de vazar o token através dela).
CREATE OR REPLACE FUNCTION instancias_basico()
RETURNS TABLE (id uuid, nome text, numero_telefone text, atendente_id uuid, ativo boolean) AS $$
  SELECT i.id, i.nome, i.numero_telefone, i.atendente_id, i.ativo
  FROM instancias i
  WHERE i.empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
