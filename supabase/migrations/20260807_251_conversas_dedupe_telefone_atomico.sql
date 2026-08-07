-- Fix de condição de corrida: criação de conversa era feita como SELECT (por
-- variantesTelefoneBR) → se não achasse, INSERT — três chamadas JS distintas
-- em vários pontos (resolverOuCriarConversa, garantirConversaOperador,
-- useIniciarConversa, webhook do WhatsApp), sem lock nenhum. Quando várias
-- mensagens do mesmo número chegam quase ao mesmo tempo (rajada de
-- WhatsApp, retries do Uazapi), múltiplas invocações concorrentes fazem o
-- SELECT antes de qualquer uma commitar o INSERT — nenhuma vê a conversa da
-- outra e cada uma cria sua própria linha (achado real: mesmo número com 6+
-- conversas "Ativo" na lista lateral). Mesma classe de bug já corrigida para
-- `pessoas` em 20260724_194_pessoa_sessao_fonti_atomica.sql.
--
-- Fix: canonicaliza o telefone gravado (mesma regra de src/lib/telefone.ts
-- ::telefoneCanonico, sempre com o "9" do celular), adiciona um UNIQUE INDEX
-- em (empresa_id, canal, contato_telefone) e substitui o padrão
-- SELECT-then-INSERT por um único INSERT ... ON CONFLICT DO UPDATE atômico.
-- Antes de poder criar o índice único, mescla as duplicatas já existentes.

-- 1. Função de canonicalização (mesma regra de variantesTelefoneBR/telefoneCanonico em TS)
CREATE OR REPLACE FUNCTION telefone_canonico_br(p_telefone TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_digits  TEXT := regexp_replace(p_telefone, '\D', '', 'g');
  v_sem_ddi TEXT;
  v_ddd     TEXT;
  v_resto   TEXT;
BEGIN
  IF v_digits LIKE '55%' THEN
    v_sem_ddi := substring(v_digits FROM 3);
  ELSE
    v_sem_ddi := v_digits;
  END IF;

  v_ddd   := substring(v_sem_ddi FROM 1 FOR 2);
  v_resto := substring(v_sem_ddi FROM 3);

  IF length(v_resto) = 8 THEN
    v_resto := '9' || v_resto;
  END IF;

  RETURN '55' || v_ddd || v_resto;
END;
$$;

-- 2. Normaliza os telefones já gravados para a forma canônica. Restrito ao
--    canal 'whatsapp': no canal 'site', contato_telefone guarda o session_id
--    do chat (não um telefone real) e não deve passar pela canonicalização BR.
WITH normalizados AS (
  SELECT id, telefone_canonico_br(contato_telefone) AS tel_canonico
  FROM conversas
  WHERE canal = 'whatsapp' AND contato_telefone IS NOT NULL
)
UPDATE conversas c
SET contato_telefone = n.tel_canonico
FROM normalizados n
WHERE c.id = n.id AND c.contato_telefone IS DISTINCT FROM n.tel_canonico;

-- 3. Move as mensagens das conversas duplicadas para a mais antiga do grupo
WITH grupos AS (
  SELECT id, created_at,
         FIRST_VALUE(id) OVER (
           PARTITION BY empresa_id, canal, contato_telefone
           ORDER BY created_at ASC, id ASC
         ) AS id_mantido
  FROM conversas
  WHERE contato_telefone IS NOT NULL
),
duplicatas AS (
  SELECT id AS id_duplicado, id_mantido FROM grupos WHERE id <> id_mantido
)
UPDATE mensagens m
SET conversa_id = d.id_mantido
FROM duplicatas d
WHERE m.conversa_id = d.id_duplicado;

-- 4. Preenche na conversa mantida os vínculos (lead/pessoa/instância/atendente)
--    que só existiam numa das duplicadas
WITH grupos AS (
  SELECT id, empresa_id, canal, contato_telefone, created_at,
         lead_id, pessoa_id, instancia_id, atendente_id,
         FIRST_VALUE(id) OVER (
           PARTITION BY empresa_id, canal, contato_telefone
           ORDER BY created_at ASC, id ASC
         ) AS id_mantido
  FROM conversas
  WHERE contato_telefone IS NOT NULL
),
duplicatas AS (
  SELECT * FROM grupos WHERE id <> id_mantido
),
agregado AS (
  SELECT id_mantido,
         (array_agg(lead_id)      FILTER (WHERE lead_id IS NOT NULL))[1]      AS lead_id,
         (array_agg(pessoa_id)    FILTER (WHERE pessoa_id IS NOT NULL))[1]    AS pessoa_id,
         (array_agg(instancia_id) FILTER (WHERE instancia_id IS NOT NULL))[1] AS instancia_id,
         (array_agg(atendente_id) FILTER (WHERE atendente_id IS NOT NULL))[1] AS atendente_id
  FROM duplicatas
  GROUP BY id_mantido
)
UPDATE conversas c
SET lead_id      = COALESCE(c.lead_id, a.lead_id),
    pessoa_id    = COALESCE(c.pessoa_id, a.pessoa_id),
    instancia_id = COALESCE(c.instancia_id, a.instancia_id),
    atendente_id = COALESCE(c.atendente_id, a.atendente_id)
FROM agregado a
WHERE c.id = a.id_mantido;

-- 5. Remove as conversas duplicadas (mensagens já foram movidas)
WITH grupos AS (
  SELECT id,
         FIRST_VALUE(id) OVER (
           PARTITION BY empresa_id, canal, contato_telefone
           ORDER BY created_at ASC, id ASC
         ) AS id_mantido
  FROM conversas
  WHERE contato_telefone IS NOT NULL
)
DELETE FROM conversas c
USING grupos g
WHERE c.id = g.id AND g.id <> g.id_mantido;

-- 6. Trava a corrida na origem: telefone único por empresa+canal
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversas_empresa_canal_telefone_unico
  ON conversas(empresa_id, canal, contato_telefone)
  WHERE contato_telefone IS NOT NULL;

-- 7. RPC atômica: get-or-create via INSERT ... ON CONFLICT, sem janela de corrida.
--    p_telefone passa por telefone_canonico_br, então só serve para canal
--    'whatsapp' (telefone BR real) — não usar para canal 'site' (session_id).
CREATE OR REPLACE FUNCTION obter_ou_criar_conversa(
  p_empresa_id    UUID,
  p_canal         TEXT,
  p_telefone      TEXT,
  p_nome          TEXT DEFAULT NULL,
  p_lead_id       UUID DEFAULT NULL,
  p_pessoa_id     UUID DEFAULT NULL,
  p_instancia_id  UUID DEFAULT NULL,
  p_atendente_id  UUID DEFAULT NULL,
  p_bot_ativo     BOOLEAN DEFAULT TRUE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_telefone TEXT := telefone_canonico_br(p_telefone);
  v_id UUID;
BEGIN
  INSERT INTO conversas (
    empresa_id, canal, contato_telefone, contato_nome,
    lead_id, pessoa_id, instancia_id, atendente_id,
    status, bot_ativo
  )
  VALUES (
    p_empresa_id, p_canal, v_telefone, p_nome,
    p_lead_id, p_pessoa_id, p_instancia_id, p_atendente_id,
    'ativo', p_bot_ativo
  )
  ON CONFLICT (empresa_id, canal, contato_telefone) WHERE contato_telefone IS NOT NULL
  DO UPDATE SET
    lead_id      = COALESCE(conversas.lead_id, EXCLUDED.lead_id),
    pessoa_id    = COALESCE(conversas.pessoa_id, EXCLUDED.pessoa_id),
    instancia_id = COALESCE(conversas.instancia_id, EXCLUDED.instancia_id)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION obter_ou_criar_conversa(UUID, TEXT, TEXT, TEXT, UUID, UUID, UUID, UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION obter_ou_criar_conversa(UUID, TEXT, TEXT, TEXT, UUID, UUID, UUID, UUID, BOOLEAN) TO authenticated, service_role;
