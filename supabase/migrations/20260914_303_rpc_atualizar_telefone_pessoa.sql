-- Bug reportado: usuários com perfil 'comercial'/'operacional' não conseguem
-- corrigir o telefone do cliente em Negócios > Compradores/Vendedores >
-- "Completar dados" (nem no formulário inline de edição) — as policies de
-- UPDATE de `processo_compradores`/`processo_vendedores`
-- (20260415_005_processos.sql, endurecidas em 20260721_181) só liberam
-- UPDATE pra perfil IN ('analista','gerente','gestor','admin'). Como
-- `CompletarDadosPessoaDrawer` propaga o telefone pra essas duas tabelas
-- direto via `.update()`, a propagação falha silenciosamente (RLS derruba
-- a linha, sem erro) pra qualquer usuário fora dessa lista — inclusive
-- quando a edição parte da tela de Pessoas (mesmo código, mesma sessão).
-- Resultado: `pessoas`/`pessoa_telefones` ficam certos, mas
-- `processo_compradores.telefone`/`processo_vendedores.telefone`
-- (denormalizados, usados na tela do Negócio) continuam com o número
-- antigo.
--
-- Em vez de abrir a policy geral de UPDATE dessas tabelas pra
-- comercial/operacional (o que liberaria edição de renda, CPF, nome etc.
-- — não é o que foi pedido), criamos uma RPC SECURITY DEFINER estreita,
-- só pra telefone, liberada pra qualquer usuário ativo da empresa (o time
-- inteiro tem contato com o cliente e precisa poder corrigir o número).
-- A RPC também grava em `pessoas_alteracoes` (mesma tabela já usada pelo
-- histórico de alterações da tela de Pessoas) com valor anterior/novo,
-- servindo como log de auditoria de quem alterou o telefone e quando.

CREATE OR REPLACE FUNCTION atualizar_telefone_pessoa(
  p_pessoa_id uuid,
  p_telefone  text,
  p_origem    text DEFAULT 'processos'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa_id   uuid;
  v_usuario_id   uuid;
  v_tel_id       uuid;
  v_tel_anterior text;
  v_telefone     text := NULLIF(TRIM(p_telefone), '');
BEGIN
  SELECT id, empresa_id INTO v_usuario_id, v_empresa_id
    FROM usuarios
    WHERE auth_user_id = auth.uid() AND ativo = true;

  IF v_usuario_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado ou inativo';
  END IF;

  IF v_telefone IS NULL THEN
    RAISE EXCEPTION 'Telefone não pode ser vazio';
  END IF;

  IF p_origem NOT IN ('leads', 'pessoas', 'processos') THEN
    RAISE EXCEPTION 'Origem inválida: %', p_origem;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pessoas WHERE id = p_pessoa_id AND empresa_id = v_empresa_id
  ) THEN
    RAISE EXCEPTION 'Pessoa não encontrada nesta empresa';
  END IF;

  SELECT id, telefone INTO v_tel_id, v_tel_anterior
    FROM pessoa_telefones
    WHERE pessoa_id = p_pessoa_id AND ativo = true
    ORDER BY principal DESC, created_at ASC
    LIMIT 1;

  IF v_tel_id IS NOT NULL THEN
    IF v_tel_anterior IS DISTINCT FROM v_telefone THEN
      UPDATE pessoa_telefones SET telefone = v_telefone WHERE id = v_tel_id;
    END IF;
  ELSE
    INSERT INTO pessoa_telefones (pessoa_id, empresa_id, telefone, principal, whatsapp, ativo)
    VALUES (p_pessoa_id, v_empresa_id, v_telefone, true, true, true);
  END IF;

  UPDATE processo_compradores SET telefone = v_telefone
    WHERE pessoa_id = p_pessoa_id AND empresa_id = v_empresa_id
      AND telefone IS DISTINCT FROM v_telefone;

  UPDATE processo_vendedores SET telefone = v_telefone
    WHERE pessoa_id = p_pessoa_id AND empresa_id = v_empresa_id
      AND telefone IS DISTINCT FROM v_telefone;

  UPDATE leads SET telefone = v_telefone
    WHERE pessoa_id = p_pessoa_id AND empresa_id = v_empresa_id
      AND telefone IS DISTINCT FROM v_telefone;

  IF v_tel_anterior IS DISTINCT FROM v_telefone THEN
    INSERT INTO pessoas_alteracoes (
      pessoa_id, empresa_id, usuario_id, campos_alterados,
      valores_anteriores, valores_novos, origem
    ) VALUES (
      p_pessoa_id, v_empresa_id, v_usuario_id, ARRAY['telefone'],
      jsonb_build_object('telefone', v_tel_anterior),
      jsonb_build_object('telefone', v_telefone),
      p_origem
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION atualizar_telefone_pessoa(uuid, text, text) TO authenticated;
