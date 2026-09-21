-- Migration 314 — obter_ou_criar_pessoa_sessao_fonti nunca reaproveita a Pessoa do
-- telefone de um USUÁRIO INTERNO (comercial/operador).
--
-- Bug (achado 2026-09-21, na frente da equipe): a migration 279 passou a reaproveitar
-- qualquer Pessoa com o telefone da conversa. No fluxo de documentos soltos
-- (*fonti inicio → mídia → *cria cliente) o telefone da conversa é o do PRÓPRIO OPERADOR,
-- então a "Pessoa da sessão" virava a pessoa do operador (ex.: "Bruno Fontinhas
-- Assessoria"). O *cria cliente seguinte adotava essa pessoa, e:
--   - o lead "ENOQUE ..." ficou ligado à pessoa do Bruno (o *salva enoque não achava);
--   - o PRÓXIMO cliente do mesmo operador cai em "lead aberto já existe" e ATUALIZA o
--     lead do cliente anterior em vez de criar um novo;
--   - se a pessoa do operador era provisória, era RENOMEADA pro nome do cliente
--     (ex.: telefone do Marcio -> "MARIA LUCIA IVANTES CORRADINI", 75 documentos).
--
-- Fix: se o telefone é de um usuário ativo da empresa, cria sempre uma Pessoa provisória
-- NOVA por sessão (o pessoa_id da sessão em fonti_marcas é resetado a cada *fonti inicio)
-- e NÃO grava o telefone do operador nela. Para telefone de cliente (cenário fromMe,
-- operador dentro da conversa do cliente) o comportamento da 279 é mantido.
--
-- Não corrige dados já gravados — ver supabase/2026-09-21_diagnostico_pessoas_de_operador.sql.

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
  v_pessoa_id   UUID;
  v_telefone    TEXT := telefone_canonico_br(p_telefone_conversa);
  v_e_operador  BOOLEAN;
BEGIN
  SELECT pessoa_id INTO v_pessoa_id
  FROM fonti_marcas
  WHERE empresa_id = p_empresa_id AND telefone_conversa = p_telefone_conversa
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sessão *fonti inicio não encontrada para este telefone';
  END IF;

  IF v_pessoa_id IS NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.empresa_id = p_empresa_id
        AND u.ativo = true
        AND (
          (u.telefone_whatsapp IS NOT NULL AND telefone_canonico_br(u.telefone_whatsapp) = v_telefone)
          OR (u.telefone IS NOT NULL AND telefone_canonico_br(u.telefone) = v_telefone)
        )
    ) INTO v_e_operador;

    IF NOT v_e_operador THEN
      -- Telefone de cliente: reaproveita Pessoa existente antes de criar (migration 279).
      SELECT pt.pessoa_id INTO v_pessoa_id
      FROM pessoa_telefones pt
      JOIN pessoas p ON p.id = pt.pessoa_id
      WHERE pt.empresa_id = p_empresa_id
        AND pt.telefone = v_telefone
        AND pt.ativo = true
        AND p.deleted_at IS NULL
      LIMIT 1;
    END IF;

    IF v_pessoa_id IS NULL THEN
      INSERT INTO pessoas (empresa_id, nome, status_identidade)
      VALUES (p_empresa_id, COALESCE(NULLIF(TRIM(p_nome), ''), 'Cliente'), 'provisoria')
      RETURNING id INTO v_pessoa_id;

      -- Telefone do operador NUNCA é vinculado à Pessoa da sessão.
      IF NOT v_e_operador THEN
        INSERT INTO pessoa_telefones (pessoa_id, empresa_id, telefone, principal, whatsapp, ativo)
        VALUES (v_pessoa_id, p_empresa_id, v_telefone, true, true, true)
        ON CONFLICT (empresa_id, telefone) WHERE ativo = true DO NOTHING;
      END IF;
    END IF;

    UPDATE fonti_marcas
    SET pessoa_id = v_pessoa_id
    WHERE empresa_id = p_empresa_id AND telefone_conversa = p_telefone_conversa;
  END IF;

  RETURN v_pessoa_id;
END;
$$;
