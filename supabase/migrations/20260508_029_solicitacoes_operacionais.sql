-- Migration: solicitacoes_operacionais — pedidos estruturados entre setores
-- Diferente de tarefa: tarefa é lembrete pontual, solicitação é pedido formal entre times
-- Ex: Comercial pede Simulação para Maiza → Maiza responde → Comercial avança lead

CREATE TYPE tipo_solicitacao AS ENUM (
  'simulacao','analise_credito','reanalise','engenharia','custas',
  'documentos','formalizacao','registro','pendencia','atendimento_cliente','outros'
);
CREATE TYPE status_solicitacao AS ENUM (
  'pendente','em_andamento','aguardando_resposta','aguardando_cliente','concluido','cancelado'
);
CREATE TYPE prioridade_solicitacao AS ENUM ('urgente','alta','normal','baixa');

CREATE TABLE solicitacoes_operacionais (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          UUID        NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
  tipo                tipo_solicitacao  NOT NULL,
  status              status_solicitacao NOT NULL DEFAULT 'pendente',
  prioridade          prioridade_solicitacao NOT NULL DEFAULT 'normal',
  responsavel_id      UUID        REFERENCES usuarios(id) ON DELETE SET NULL,
  solicitante_id      UUID        NOT NULL REFERENCES usuarios(id),
  -- Vínculos opcionais — lead e processo são SEMPRE opcionais
  lead_id             UUID        REFERENCES leads(id)     ON DELETE SET NULL,
  processo_id         UUID        REFERENCES processos(id) ON DELETE SET NULL,
  pessoa_id           UUID        REFERENCES pessoas(id)   ON DELETE SET NULL,
  conversa_id         UUID        REFERENCES conversas(id) ON DELETE SET NULL,
  -- Conteúdo
  titulo              TEXT        NOT NULL,
  descricao           TEXT,
  retorno_operacional TEXT,
  -- SLA
  sla_at              TIMESTAMPTZ,
  concluido_em        TIMESTAMPTZ,
  -- Auditoria
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ
);

-- Índice principal da fila (responsável vê suas pendências ordenadas)
CREATE INDEX idx_sol_op_fila     ON solicitacoes_operacionais(empresa_id, responsavel_id, status, prioridade, sla_at)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_sol_op_lead     ON solicitacoes_operacionais(lead_id)     WHERE deleted_at IS NULL AND lead_id IS NOT NULL;
CREATE INDEX idx_sol_op_processo ON solicitacoes_operacionais(processo_id) WHERE deleted_at IS NULL AND processo_id IS NOT NULL;
CREATE INDEX idx_sol_op_conversa ON solicitacoes_operacionais(conversa_id) WHERE deleted_at IS NULL AND conversa_id IS NOT NULL;
CREATE INDEX idx_sol_op_pessoa   ON solicitacoes_operacionais(pessoa_id)   WHERE deleted_at IS NULL AND pessoa_id IS NOT NULL;

CREATE TRIGGER sol_op_updated_at
  BEFORE UPDATE ON solicitacoes_operacionais
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE solicitacoes_operacionais ENABLE ROW LEVEL SECURITY;

-- SELECT: qualquer membro ativo da empresa
CREATE POLICY "sol_op_select" ON solicitacoes_operacionais FOR SELECT
  USING (empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() AND ativo = true LIMIT 1));

-- INSERT: qualquer membro ativo
CREATE POLICY "sol_op_insert" ON solicitacoes_operacionais FOR INSERT
  WITH CHECK (empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() AND ativo = true LIMIT 1));

-- UPDATE: responsável, solicitante ou gestor
CREATE POLICY "sol_op_update" ON solicitacoes_operacionais FOR UPDATE
  USING (empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid())
    AND (responsavel_id   = (SELECT id FROM usuarios WHERE auth_user_id = auth.uid())
      OR solicitante_id   = (SELECT id FROM usuarios WHERE auth_user_id = auth.uid())
      OR (SELECT perfil FROM usuarios WHERE auth_user_id = auth.uid()) IN ('admin','gerente')));

-- Service role (webhooks)
CREATE POLICY "sol_op_service" ON solicitacoes_operacionais FOR ALL TO service_role USING (true);

-- Realtime para fila ao vivo
ALTER PUBLICATION supabase_realtime ADD TABLE solicitacoes_operacionais;

-- RPC: cria solicitação com SLA calculado automaticamente a partir de sla_config_operacional
CREATE OR REPLACE FUNCTION criar_solicitacao_operacional(
  p_tipo          tipo_solicitacao,
  p_titulo        TEXT,
  p_descricao     TEXT                  DEFAULT NULL,
  p_prioridade    prioridade_solicitacao DEFAULT 'normal',
  p_responsavel_id UUID                 DEFAULT NULL,
  p_lead_id       UUID                  DEFAULT NULL,
  p_processo_id   UUID                  DEFAULT NULL,
  p_pessoa_id     UUID                  DEFAULT NULL,
  p_conversa_id   UUID                  DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_empresa_id     UUID;
  v_solicitante_id UUID;
  v_horas_sla      INTEGER;
  v_id             UUID;
BEGIN
  SELECT id, empresa_id
    INTO v_solicitante_id, v_empresa_id
    FROM usuarios
   WHERE auth_user_id = auth.uid() AND ativo = true
   LIMIT 1;

  IF v_solicitante_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado ou inativo';
  END IF;

  SELECT horas_sla
    INTO v_horas_sla
    FROM sla_config_operacional
   WHERE empresa_id = v_empresa_id AND tipo = p_tipo AND ativo = true;

  INSERT INTO solicitacoes_operacionais (
    empresa_id, tipo, titulo, descricao, prioridade,
    responsavel_id, solicitante_id,
    lead_id, processo_id, pessoa_id, conversa_id,
    sla_at
  ) VALUES (
    v_empresa_id, p_tipo, trim(p_titulo), p_descricao, p_prioridade,
    p_responsavel_id, v_solicitante_id,
    p_lead_id, p_processo_id, p_pessoa_id, p_conversa_id,
    now() + (COALESCE(v_horas_sla, 24) || ' hours')::INTERVAL
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION criar_solicitacao_operacional TO authenticated;
