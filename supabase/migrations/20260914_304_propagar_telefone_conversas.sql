-- Reportado: corrigir o telefone (via atualizar_telefone_pessoa, migration
-- 303) não refletia no módulo Conversas — `conversas.contato_telefone`
-- (mais um campo denormalizado, vinculado por pessoa_id) ficava com o
-- número antigo/genérico. Isso importa porque é o número usado de fato
-- pra enviar mensagem ao cliente (ver src/lib/comunicacao/enviarMensagemHumano.ts,
-- que manda a mensagem pro `contato_telefone` da conversa).
--
-- Adiciona a propagação pra `conversas` na mesma RPC, mesmo padrão já usado
-- pra processo_compradores/processo_vendedores/leads.

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

  -- contato_telefone é o número usado pra envio de mensagem (WhatsApp/site);
  -- não mexe em conversa de grupo (contato_grupo_id/@g.us, fora do escopo
  -- de telefone de pessoa física).
  UPDATE conversas SET contato_telefone = v_telefone
    WHERE pessoa_id = p_pessoa_id AND empresa_id = v_empresa_id
      AND contato_telefone IS DISTINCT FROM v_telefone
      AND contato_telefone NOT LIKE '%@g.us';

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
