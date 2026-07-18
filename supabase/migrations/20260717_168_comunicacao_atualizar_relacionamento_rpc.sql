-- Central de Comunicação — RPC de escrita do Relacionamento de Comunicação.
-- Único ponto de alteração de modo/estado/representante. Toda a validação de
-- segurança e de integridade de domínio roda dentro da própria função — não confia
-- em RLS sozinha, nem em nenhum parâmetro de empresa/permissão vindo do client.
-- Chamada direto do client autenticado via supabase.rpc(), mesmo padrão já usado
-- por reordenar_fases; o corpo da função é uma transação implícita (qualquer
-- RAISE EXCEPTION desfaz tudo, inclusive o histórico).

-- Tabela de histórico primeiro: com check_function_bodies ligado (padrão do
-- Postgres), CREATE FUNCTION valida os identificadores referenciados no corpo —
-- a tabela precisa existir antes da função que grava nela.
CREATE TABLE IF NOT EXISTS comunicacao_relacionamentos_historico (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  relacionamento_id         UUID        NOT NULL REFERENCES comunicacao_relacionamentos(id) ON DELETE CASCADE,
  modo_anterior             TEXT,
  modo_novo                 TEXT,
  estado_anterior           TEXT,
  estado_novo               TEXT,
  representado_por_anterior UUID,
  representado_por_novo     UUID,
  usuario_id                UUID        NOT NULL REFERENCES usuarios(id),
  motivo                    TEXT        NOT NULL CHECK (btrim(motivo) <> ''),
  criado_em                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comrel_hist_relacionamento ON comunicacao_relacionamentos_historico(relacionamento_id);

ALTER TABLE comunicacao_relacionamentos_historico ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "comrel_hist_select_empresa" ON comunicacao_relacionamentos_historico;
CREATE POLICY "comrel_hist_select_empresa" ON comunicacao_relacionamentos_historico
  FOR SELECT USING (
    relacionamento_id IN (
      SELECT id FROM comunicacao_relacionamentos
      WHERE empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
    )
  );

-- Sem policy de INSERT para authenticated: só a função SECURITY DEFINER grava aqui.
DROP POLICY IF EXISTS "comrel_hist_service_all" ON comunicacao_relacionamentos_historico;
CREATE POLICY "comrel_hist_service_all" ON comunicacao_relacionamentos_historico
  FOR ALL USING (auth.role() = 'service_role');


CREATE OR REPLACE FUNCTION comunicacao_atualizar_relacionamento(
  p_relacionamento_id   UUID,
  p_modo                TEXT,
  p_estado              TEXT,
  p_representado_por_id UUID,
  p_motivo              TEXT
)
RETURNS comunicacao_relacionamentos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_usuario       usuarios%ROWTYPE;
  v_row           comunicacao_relacionamentos%ROWTYPE;
  v_representante comunicacao_relacionamentos%ROWTYPE;
  v_anterior      comunicacao_relacionamentos%ROWTYPE;
  v_cursor_id     UUID;
  v_iteracoes     INT := 0;
BEGIN
  -- 1. Autenticação — nunca confiar em parâmetro do client pra identidade/empresa.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NAO_AUTENTICADO';
  END IF;

  SELECT * INTO v_usuario FROM usuarios
    WHERE auth_user_id = auth.uid() AND deleted_at IS NULL
    LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NAO_AUTENTICADO';
  END IF;
  IF NOT v_usuario.ativo THEN
    RAISE EXCEPTION 'USUARIO_INATIVO';
  END IF;

  -- 2. Permissão — só perfis internos alteram relacionamento (perfil 'cliente' é login externo).
  IF v_usuario.perfil NOT IN ('admin', 'gerente', 'analista', 'consultor') THEN
    RAISE EXCEPTION 'USUARIO_SEM_PERMISSAO';
  END IF;

  -- 3. Motivo obrigatório, sempre — antes de tocar em qualquer linha.
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'MOTIVO_OBRIGATORIO';
  END IF;

  IF p_modo NOT IN ('direto', 'intermediado') THEN
    RAISE EXCEPTION 'MODO_INVALIDO';
  END IF;
  IF p_estado NOT IN ('ativo', 'suspenso', 'encerrado') THEN
    RAISE EXCEPTION 'ESTADO_INVALIDO';
  END IF;

  -- 4. Carrega o relacionamento alvo com lock, já filtrando por empresa do usuário
  -- autenticado — se o ID pertence a outra empresa, o SELECT simplesmente não encontra
  -- nada (mesma mensagem de "não encontrado", não vaza existência cross-tenant).
  SELECT * INTO v_row FROM comunicacao_relacionamentos
    WHERE id = p_relacionamento_id AND empresa_id = v_usuario.empresa_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RELACIONAMENTO_NAO_ENCONTRADO';
  END IF;

  v_anterior := v_row;

  -- 5. Coerência modo/representante.
  IF p_modo = 'direto' AND p_representado_por_id IS NOT NULL THEN
    RAISE EXCEPTION 'MODO_DIRETO_NAO_ACEITA_REPRESENTANTE';
  END IF;
  IF p_modo = 'intermediado' AND p_representado_por_id IS NULL THEN
    RAISE EXCEPTION 'REPRESENTANTE_OBRIGATORIO';
  END IF;

  IF p_representado_por_id IS NOT NULL THEN
    IF p_representado_por_id = p_relacionamento_id THEN
      RAISE EXCEPTION 'AUTORREPRESENTACAO_PROIBIDA';
    END IF;

    -- Representante também precisa pertencer à empresa do usuário autenticado.
    SELECT * INTO v_representante FROM comunicacao_relacionamentos
      WHERE id = p_representado_por_id AND empresa_id = v_usuario.empresa_id
      FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'REPRESENTANTE_NAO_ENCONTRADO';
    END IF;

    -- Mesmo caso: mesmo lead_id OU mesmo processo_id (o que estiver preenchido em v_row).
    IF (v_row.lead_id IS NOT NULL AND v_representante.lead_id IS DISTINCT FROM v_row.lead_id)
       OR (v_row.processo_id IS NOT NULL AND v_representante.processo_id IS DISTINCT FROM v_row.processo_id) THEN
      RAISE EXCEPTION 'CASO_DIVERGENTE';
    END IF;

    IF v_representante.estado <> 'ativo' THEN
      RAISE EXCEPTION 'REPRESENTANTE_INATIVO';
    END IF;

    -- Proibição de ciclo: percorre a cadeia representado_por a partir do candidato.
    v_cursor_id := v_representante.representado_por_id;
    WHILE v_cursor_id IS NOT NULL AND v_iteracoes < 50 LOOP
      IF v_cursor_id = p_relacionamento_id THEN
        RAISE EXCEPTION 'CICLO_PROIBIDO';
      END IF;
      SELECT representado_por_id INTO v_cursor_id FROM comunicacao_relacionamentos WHERE id = v_cursor_id;
      v_iteracoes := v_iteracoes + 1;
    END LOOP;
  END IF;

  -- 6. Bloqueia suspender/encerrar quem tem dependentes ativos apontando pra ele.
  -- Estado inconsistente não é aceito nem como aviso: a equipe precisa primeiro
  -- transferir ou remover as representações dependentes.
  IF p_estado IN ('suspenso', 'encerrado') THEN
    IF EXISTS (
      SELECT 1 FROM comunicacao_relacionamentos
      WHERE representado_por_id = p_relacionamento_id AND estado = 'ativo'
    ) THEN
      RAISE EXCEPTION 'REPRESENTANTE_POSSUI_REPRESENTADOS_ATIVOS';
    END IF;
  END IF;

  -- 7. Update + histórico, mesma transação (corpo da função já é atômico).
  UPDATE comunicacao_relacionamentos SET
    modo_relacionamento = p_modo,
    estado               = p_estado,
    representado_por_id  = p_representado_por_id
  WHERE id = p_relacionamento_id
  RETURNING * INTO v_row;

  INSERT INTO comunicacao_relacionamentos_historico (
    relacionamento_id, modo_anterior, modo_novo,
    estado_anterior, estado_novo,
    representado_por_anterior, representado_por_novo,
    usuario_id, motivo
  ) VALUES (
    p_relacionamento_id, v_anterior.modo_relacionamento, p_modo,
    v_anterior.estado, p_estado,
    v_anterior.representado_por_id, p_representado_por_id,
    v_usuario.id, p_motivo
  );

  RETURN v_row;
END;
$$;

-- Defesa em profundidade: ninguém chama isso sem sessão válida, mesmo antes de
-- qualquer checagem interna rodar.
REVOKE ALL ON FUNCTION comunicacao_atualizar_relacionamento FROM PUBLIC;
GRANT EXECUTE ON FUNCTION comunicacao_atualizar_relacionamento TO authenticated;
