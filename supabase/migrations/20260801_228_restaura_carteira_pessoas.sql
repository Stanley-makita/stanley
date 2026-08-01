-- Corrige regressão da migration 20260731_226_pessoas_configuravel.sql: ao
-- trocar a lista fixa de perfis por usuario_atual_pode('pessoas.ver'), essa
-- migration derrubou sem querer a restrição de carteira comercial que a
-- 20260724_186_visibilidade_carteira_comercial.sql já tinha implementado
-- (comercial só vê pessoas dos próprios leads). O comentário da 226 diz que
-- preserva "as condições atuais (20260721_178)", mas 178 é a versão ANTERIOR
-- à 186 — ou seja, usou como base a regra errada (sem carteira), sem querer
-- reabrindo a visão de Pessoas de qualquer perfil comercial pra empresa
-- inteira. Achado real: usuária comercial via as 4 Pessoas da empresa,
-- incluindo uma sem nenhum lead atribuído a ela.
--
-- Restaura a condição de carteira, mantendo a permissão configurável
-- (pessoas.ver) como gate adicional por cima — as duas convivem.

DROP POLICY IF EXISTS "pessoas_empresa_select" ON pessoas;
CREATE POLICY "pessoas_empresa_select" ON pessoas FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM usuarios u
    WHERE u.auth_user_id = auth.uid() AND u.ativo = true
      AND u.empresa_id = pessoas.empresa_id
      AND usuario_atual_pode('pessoas.ver')
  )
  AND (
    usuario_atual_perfil() <> 'comercial'
    OR EXISTS (
      SELECT 1 FROM leads l
      WHERE l.pessoa_id = pessoas.id
        AND l.deleted_at IS NULL
        AND l.responsavel_id = usuario_atual_id()
    )
  )
);

NOTIFY pgrst, 'reload schema';
