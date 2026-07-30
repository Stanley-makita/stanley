-- Troca o hardcode de perfil na RLS de SELECT de leads (perfil <> 'comercial')
-- pela permissão configurável leads.ver_todas, resolvida em 3 camadas por
-- usuario_atual_pode() (20260730_216). Mantém exatamente a mesma estrutura de
-- fallback (dono do lead sempre vê o próprio, independente de leads.ver_todas)
-- — só troca QUEM decide "vê tudo": antes o Postgres perguntava "o perfil é
-- diferente de comercial?", agora pergunta "esse usuário/perfil tem
-- leads.ver_todas?". Os defaults em PERMISSOES_PADRAO reproduzem a matriz
-- antiga, então nenhum acesso muda enquanto ninguém configurar uma exceção.

DROP POLICY IF EXISTS "leads_select_empresa" ON leads;
CREATE POLICY "leads_select_empresa" ON leads
  FOR SELECT USING (
    empresa_id = usuario_atual_empresa_id()
    AND deleted_at IS NULL
    AND (
      usuario_atual_pode('leads.ver_todas')
      OR responsavel_id = usuario_atual_id()
    )
  );
