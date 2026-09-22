-- Mesma causa raiz do PR #335 (20260922_320), agora em UPDATE em vez de SELECT.
--
-- Achado real (2026-09-22): usuária com perfil customizado ("Assistente"),
-- com leads.ver_todas liberado por override, conseguia VER e EDITAR a Pessoa
-- de um lead fora da própria carteira (SELECT de pessoas/leads já corrigido
-- em 20260922_320) — mas o "Salvar Dados da Pessoa" (AbaPessoa.tsx) propaga
-- nome/cpf/data_nascimento/etc. também pro `lead` (colunas duplicadas que o
-- sidebar lê), e esse UPDATE em `leads` continuava bloqueado pela RLS porque
-- `leads_update_responsavel_ou_gerencia` (20260724_186) nunca foi migrada
-- pra usar usuario_atual_pode() como a SELECT foi em 20260730_217 — ainda
-- checava perfil bruto (`IN ('admin','gerente','gestor','apoio')`), ignorando
-- os 3 níveis de override que usuario_atual_pode('leads.ver_todas') resolve.
--
-- Sintoma real: salvar a aba Pessoa atualizava a Pessoa normalmente (o
-- formulário refletia o valor novo), mas o UPDATE em `leads` retornava 0
-- linhas silenciosamente (PostgREST não avisa) — o sidebar (que lê
-- lead.data_nascimento/email/cpf) continuava mostrando o dado antigo. No
-- admin (perfil bate na lista hardcoded) tudo atualizava na hora.

DROP POLICY IF EXISTS "leads_update_responsavel_ou_gerencia" ON leads;
CREATE POLICY "leads_update_responsavel_ou_gerencia" ON leads
  FOR UPDATE
  USING (
    empresa_id = usuario_atual_empresa_id()
    AND (
      responsavel_id = usuario_atual_id()
      OR usuario_atual_pode('leads.ver_todas')
    )
  )
  WITH CHECK (
    empresa_id = usuario_atual_empresa_id()
  );

NOTIFY pgrst, 'reload schema';
