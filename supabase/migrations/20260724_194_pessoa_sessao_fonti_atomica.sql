-- Fix de condição de corrida na PR #49 (Pessoa provisória por sessão *fonti
-- inicio): o webhook fazia SELECT fonti_marcas.pessoa_id → se nulo, INSERT
-- pessoas → UPDATE fonti_marcas, como três chamadas JS separadas, sem lock
-- nenhum. Quando o cliente manda vários documentos quase ao mesmo tempo, o
-- Uazapi dispara o webhook quase em paralelo pra cada um — duas invocações
-- podem ler pessoa_id=null ANTES de qualquer uma escrever, cada uma cria sua
-- própria Pessoa provisória, e os documentos ficam divididos entre as duas
-- (achado real: 4 documentos enviados, só 2 chegaram vinculados ao Lead).
--
-- Fix: resolver/criar a Pessoa da sessão inteira dentro de uma única função
-- Postgres, com SELECT ... FOR UPDATE travando a linha de fonti_marcas — a
-- segunda chamada concorrente bloqueia até a primeira commitar, e então
-- enxerga o pessoa_id já preenchido em vez de criar um duplicado.

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
BEGIN
  SELECT pessoa_id INTO v_pessoa_id
  FROM fonti_marcas
  WHERE empresa_id = p_empresa_id AND telefone_conversa = p_telefone_conversa
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sessão *fonti inicio não encontrada para este telefone';
  END IF;

  IF v_pessoa_id IS NULL THEN
    INSERT INTO pessoas (empresa_id, nome, status_identidade)
    VALUES (p_empresa_id, COALESCE(NULLIF(TRIM(p_nome), ''), 'Cliente'), 'provisoria')
    RETURNING id INTO v_pessoa_id;

    UPDATE fonti_marcas
    SET pessoa_id = v_pessoa_id
    WHERE empresa_id = p_empresa_id AND telefone_conversa = p_telefone_conversa;
  END IF;

  RETURN v_pessoa_id;
END;
$$;

REVOKE ALL ON FUNCTION obter_ou_criar_pessoa_sessao_fonti(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION obter_ou_criar_pessoa_sessao_fonti(UUID, TEXT, TEXT) TO authenticated, service_role;
