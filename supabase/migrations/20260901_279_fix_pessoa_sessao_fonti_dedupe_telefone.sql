-- Corrige obter_ou_criar_pessoa_sessao_fonti (migration 20260724_194): cada vez
-- que *fonti inicio é rodado de novo pro mesmo telefone, a sessão em
-- fonti_marcas reseta pessoa_id pra null, e essa função criava uma Pessoa NOVA
-- sem nunca checar se já existia alguém com aquele telefone (diferente do
-- fluxo normal em buscarOuCriarPessoa, que sempre faz essa checagem). Achado
-- real: mesmo comercial gerou 4 "Pessoa provisória" duplicadas, cada uma com
-- os documentos de teste daquela sessão, sem telefone nenhum vinculado.
--
-- Fix: antes de criar, busca por telefone (mesma canonicalização usada em
-- obter_ou_criar_conversa/telefone_canonico_br). Se achar, reaproveita — e
-- vincula o telefone à Pessoa recém-criada quando não achar (a função antiga
-- nunca gravava telefone_pessoa nenhum, então o próximo *fonti inicio nunca
-- tinha como encontrar essa Pessoa de novo por telefone).

CREATE OR REPLACE FUNCTION obter_ou_criar_pessoa_sessao_fonti(
  p_empresa_id        UUID,
  p_telefone_conversa TEXT,
  p_nome              TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pessoa_id UUID;
  v_telefone  TEXT := telefone_canonico_br(p_telefone_conversa);
BEGIN
  SELECT pessoa_id INTO v_pessoa_id
  FROM fonti_marcas
  WHERE empresa_id = p_empresa_id AND telefone_conversa = p_telefone_conversa
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sessão *fonti inicio não encontrada para este telefone';
  END IF;

  IF v_pessoa_id IS NULL THEN
    -- Reaproveita Pessoa existente com esse telefone antes de criar uma nova.
    SELECT pt.pessoa_id INTO v_pessoa_id
    FROM pessoa_telefones pt
    JOIN pessoas p ON p.id = pt.pessoa_id
    WHERE pt.empresa_id = p_empresa_id
      AND pt.telefone = v_telefone
      AND pt.ativo = true
      AND p.deleted_at IS NULL
    LIMIT 1;

    IF v_pessoa_id IS NULL THEN
      INSERT INTO pessoas (empresa_id, nome, status_identidade)
      VALUES (p_empresa_id, COALESCE(NULLIF(TRIM(p_nome), ''), 'Cliente'), 'provisoria')
      RETURNING id INTO v_pessoa_id;

      INSERT INTO pessoa_telefones (pessoa_id, empresa_id, telefone, principal, whatsapp, ativo)
      VALUES (v_pessoa_id, p_empresa_id, v_telefone, true, true, true)
      ON CONFLICT (empresa_id, telefone) WHERE ativo = true DO NOTHING;
    END IF;

    UPDATE fonti_marcas
    SET pessoa_id = v_pessoa_id
    WHERE empresa_id = p_empresa_id AND telefone_conversa = p_telefone_conversa;
  END IF;

  RETURN v_pessoa_id;
END;
$$;
