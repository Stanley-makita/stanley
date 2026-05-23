-- ============================================================
-- Migration: 20260430_015_lead_tarefas
-- Tarefas e follow-ups vinculados a leads
-- ============================================================

CREATE TABLE IF NOT EXISTS lead_tarefas (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id        UUID         NOT NULL REFERENCES leads(id) ON DELETE RESTRICT,
  empresa_id     UUID         NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
  titulo         TEXT         NOT NULL,
  descricao      TEXT,
  categoria      TEXT         NOT NULL DEFAULT 'contato',
  prioridade     TEXT         NOT NULL DEFAULT 'media'
                              CHECK (prioridade IN ('baixa', 'media', 'alta', 'urgente')),
  status         TEXT         NOT NULL DEFAULT 'pendente'
                              CHECK (status IN ('pendente', 'concluida', 'cancelada')),
  responsavel_id UUID         REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_por     UUID         REFERENCES usuarios(id) ON DELETE SET NULL,
  data_prazo     DATE,
  concluida      BOOLEAN      NOT NULL DEFAULT false,
  concluida_em   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  deleted_at     TIMESTAMPTZ
);

ALTER TABLE lead_tarefas ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_lead_tarefas_lead     ON lead_tarefas(lead_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_lead_tarefas_empresa  ON lead_tarefas(empresa_id, data_prazo) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_lead_tarefas_resp     ON lead_tarefas(responsavel_id) WHERE deleted_at IS NULL;

-- RLS: usuário vê tarefas da sua empresa
CREATE POLICY lead_tarefas_empresa ON lead_tarefas
  USING (
    empresa_id IN (
      SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid()
    )
  );

-- RPC: criar tarefa de lead (bypassa RLS para checar permissão)
CREATE OR REPLACE FUNCTION criar_lead_tarefa(
  p_lead_id      UUID,
  p_titulo       TEXT,
  p_descricao    TEXT    DEFAULT NULL,
  p_categoria    TEXT    DEFAULT 'contato',
  p_prioridade   TEXT    DEFAULT 'media',
  p_responsavel  UUID    DEFAULT NULL,
  p_data_prazo   DATE    DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa_id UUID;
  v_criado_por UUID;
  v_novo_id    UUID;
BEGIN
  SELECT empresa_id INTO v_empresa_id
  FROM leads WHERE id = p_lead_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead não encontrado';
  END IF;

  SELECT empresa_id, id INTO v_empresa_id, v_criado_por
  FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1;

  INSERT INTO lead_tarefas (
    lead_id, empresa_id, titulo, descricao, categoria,
    prioridade, responsavel_id, criado_por, data_prazo
  ) VALUES (
    p_lead_id, v_empresa_id, trim(p_titulo), p_descricao, p_categoria,
    p_prioridade, COALESCE(p_responsavel, v_criado_por), v_criado_por, p_data_prazo
  )
  RETURNING id INTO v_novo_id;

  RETURN v_novo_id;
END;
$$;

-- RPC: concluir tarefa
CREATE OR REPLACE FUNCTION concluir_lead_tarefa(p_tarefa_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa_id UUID;
BEGIN
  SELECT empresa_id INTO v_empresa_id
  FROM lead_tarefas WHERE id = p_tarefa_id AND deleted_at IS NULL;

  IF NOT FOUND THEN RAISE EXCEPTION 'Tarefa não encontrada'; END IF;

  UPDATE lead_tarefas
  SET concluida = true, concluida_em = now(), status = 'concluida', updated_at = now()
  WHERE id = p_tarefa_id;
END;
$$;

REVOKE ALL ON FUNCTION criar_lead_tarefa(UUID,TEXT,TEXT,TEXT,TEXT,UUID,DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION criar_lead_tarefa(UUID,TEXT,TEXT,TEXT,TEXT,UUID,DATE) TO authenticated;

REVOKE ALL ON FUNCTION concluir_lead_tarefa(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION concluir_lead_tarefa(UUID) TO authenticated;
