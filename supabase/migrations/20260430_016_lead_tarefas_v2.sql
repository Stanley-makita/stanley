-- ============================================================
-- Migration: 20260430_016_lead_tarefas_v2
-- Adiciona: horário início/término, comentários, edição, exclusão
-- ============================================================

-- Campos de horário (opcionais) na tarefa
ALTER TABLE lead_tarefas
  ADD COLUMN IF NOT EXISTS horario_inicio TIME,
  ADD COLUMN IF NOT EXISTS horario_termino TIME;

-- Tabela de comentários de tarefa
CREATE TABLE IF NOT EXISTS lead_tarefa_comentarios (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tarefa_id  UUID        NOT NULL REFERENCES lead_tarefas(id) ON DELETE RESTRICT,
  empresa_id UUID        NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
  usuario_id UUID        REFERENCES usuarios(id) ON DELETE SET NULL,
  texto      TEXT        NOT NULL CHECK (length(trim(texto)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE lead_tarefa_comentarios ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_ltc_tarefa ON lead_tarefa_comentarios(tarefa_id);
CREATE INDEX IF NOT EXISTS idx_ltc_empresa ON lead_tarefa_comentarios(empresa_id, created_at DESC);

CREATE POLICY ltc_empresa ON lead_tarefa_comentarios
  USING (
    empresa_id IN (
      SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid()
    )
  );

-- RPC: adicionar comentário à tarefa
CREATE OR REPLACE FUNCTION comentar_lead_tarefa(
  p_tarefa_id UUID,
  p_texto     TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa_id UUID;
  v_usuario_id UUID;
  v_novo_id    UUID;
BEGIN
  SELECT empresa_id INTO v_empresa_id
  FROM lead_tarefas WHERE id = p_tarefa_id AND deleted_at IS NULL;

  IF NOT FOUND THEN RAISE EXCEPTION 'Tarefa não encontrada'; END IF;

  SELECT empresa_id, id INTO v_empresa_id, v_usuario_id
  FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1;

  IF length(trim(p_texto)) = 0 THEN
    RAISE EXCEPTION 'Comentário não pode ser vazio';
  END IF;

  INSERT INTO lead_tarefa_comentarios (tarefa_id, empresa_id, usuario_id, texto)
  VALUES (p_tarefa_id, v_empresa_id, v_usuario_id, trim(p_texto))
  RETURNING id INTO v_novo_id;

  RETURN v_novo_id;
END;
$$;

-- RPC: editar tarefa
CREATE OR REPLACE FUNCTION editar_lead_tarefa(
  p_tarefa_id       UUID,
  p_titulo          TEXT    DEFAULT NULL,
  p_descricao       TEXT    DEFAULT NULL,
  p_categoria       TEXT    DEFAULT NULL,
  p_prioridade      TEXT    DEFAULT NULL,
  p_responsavel_id  UUID    DEFAULT NULL,
  p_data_prazo      DATE    DEFAULT NULL,
  p_horario_inicio  TIME    DEFAULT NULL,
  p_horario_termino TIME    DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa_id UUID;
  v_caller_empresa UUID;
BEGIN
  SELECT empresa_id INTO v_empresa_id
  FROM lead_tarefas WHERE id = p_tarefa_id AND deleted_at IS NULL;

  IF NOT FOUND THEN RAISE EXCEPTION 'Tarefa não encontrada'; END IF;

  SELECT empresa_id INTO v_caller_empresa
  FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1;

  IF v_empresa_id IS DISTINCT FROM v_caller_empresa THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  UPDATE lead_tarefas SET
    titulo          = COALESCE(p_titulo,          titulo),
    descricao       = COALESCE(p_descricao,       descricao),
    categoria       = COALESCE(p_categoria,       categoria),
    prioridade      = COALESCE(p_prioridade,      prioridade),
    responsavel_id  = COALESCE(p_responsavel_id,  responsavel_id),
    data_prazo      = COALESCE(p_data_prazo,      data_prazo),
    horario_inicio  = p_horario_inicio,
    horario_termino = p_horario_termino,
    updated_at      = now()
  WHERE id = p_tarefa_id;
END;
$$;

-- RPC: excluir tarefa (soft delete)
CREATE OR REPLACE FUNCTION excluir_lead_tarefa(p_tarefa_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa_id UUID;
  v_caller_empresa UUID;
BEGIN
  SELECT empresa_id INTO v_empresa_id
  FROM lead_tarefas WHERE id = p_tarefa_id AND deleted_at IS NULL;

  IF NOT FOUND THEN RAISE EXCEPTION 'Tarefa não encontrada'; END IF;

  SELECT empresa_id INTO v_caller_empresa
  FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1;

  IF v_empresa_id IS DISTINCT FROM v_caller_empresa THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  UPDATE lead_tarefas SET deleted_at = now() WHERE id = p_tarefa_id;
END;
$$;

-- Grants
REVOKE ALL ON FUNCTION comentar_lead_tarefa(UUID,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION comentar_lead_tarefa(UUID,TEXT) TO authenticated;

REVOKE ALL ON FUNCTION editar_lead_tarefa(UUID,TEXT,TEXT,TEXT,TEXT,UUID,DATE,TIME,TIME) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION editar_lead_tarefa(UUID,TEXT,TEXT,TEXT,TEXT,UUID,DATE,TIME,TIME) TO authenticated;

REVOKE ALL ON FUNCTION excluir_lead_tarefa(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION excluir_lead_tarefa(UUID) TO authenticated;
