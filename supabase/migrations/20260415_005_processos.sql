-- =============================================================================
-- MIGRATION 005 — Módulo Processos
-- =============================================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  CREATE TYPE modalidade_processo AS ENUM (
    'SFI', 'SBPE', 'PMCMV', 'Pro_Cotista', 'CGI', 'Contrato'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE status_emissao AS ENUM ('emitido', 'nao_emitido');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE chance_emissao AS ENUM ('certeza', 'incerteza');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE status_processo AS ENUM (
    'em_analise', 'aprovado', 'pendente', 'reprovado', 'cancelado'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE tipo_comentario AS ENUM ('observacao', 'alteracao', 'solicitacao');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE prioridade_tarefa AS ENUM ('baixa', 'media', 'alta');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS processo_contadores (
  empresa_id   UUID        NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  ultimo_seq   INTEGER     NOT NULL DEFAULT 0,
  PRIMARY KEY (empresa_id)
);

ALTER TABLE processo_contadores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_only" ON processo_contadores
  USING (false);

CREATE TABLE IF NOT EXISTS processos (
  id                      UUID                  PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id              UUID                  NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  numero_processo         TEXT                  NOT NULL,
  nome_imovel             TEXT                  NOT NULL,
  modalidade              modalidade_processo   NOT NULL,
  status_processo         status_processo       NOT NULL DEFAULT 'em_analise',
  status_emissao          status_emissao        NOT NULL DEFAULT 'nao_emitido',
  chance_emissao          chance_emissao        NOT NULL DEFAULT 'incerteza',
  valor_imovel            NUMERIC(15,2),
  valor_financiado        NUMERIC(15,2),
  valor_entrada           NUMERIC(15,2),
  valor_proposta          NUMERIC(15,2),
  saldo_conta             NUMERIC(15,2)         NOT NULL DEFAULT 0,
  banco_id                UUID                  REFERENCES bancos(id),
  produto_id              UUID                  REFERENCES produtos(id),
  tem_assessoria          BOOLEAN               NOT NULL DEFAULT false,
  comissao_comercial      NUMERIC(5,2),
  comissao_empresa        NUMERIC(5,2),
  numero_contrato         TEXT,
  data_contrato           DATE,
  operacional_id          UUID                  REFERENCES usuarios(id),
  comercial_id            UUID                  REFERENCES usuarios(id),
  corretor_nome           TEXT,
  corretor_creci          TEXT,
  fase_atual_id           UUID,
  data_inicio             DATE                  NOT NULL DEFAULT CURRENT_DATE,
  data_emissao            DATE,
  data_proposta           DATE,
  emissao_em              TIMESTAMPTZ,
  lead_id                 UUID                  REFERENCES leads(id),
  created_at              TIMESTAMPTZ           NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ           NOT NULL DEFAULT now(),
  deleted_at              TIMESTAMPTZ,
  CONSTRAINT uq_numero_processo_empresa UNIQUE (empresa_id, numero_processo)
);

ALTER TABLE processos
  ADD CONSTRAINT fk_processo_fase
  FOREIGN KEY (fase_atual_id) REFERENCES fases(id);

ALTER TABLE processos ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_processos_empresa ON processos(empresa_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_processos_status ON processos(empresa_id, status_processo) WHERE deleted_at IS NULL;
CREATE INDEX idx_processos_emissao ON processos(empresa_id, status_emissao) WHERE deleted_at IS NULL;
CREATE INDEX idx_processos_banco ON processos(banco_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_processos_operacional ON processos(operacional_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_processos_comercial ON processos(comercial_id) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_processos_updated_at
  BEFORE UPDATE ON processos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION gerar_numero_processo()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_seq INTEGER;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM usuarios
    WHERE id = auth.uid()
      AND empresa_id = NEW.empresa_id
      AND ativo = true
  ) THEN
    RAISE EXCEPTION 'Acesso negado: usuário não pertence à empresa';
  END IF;

  INSERT INTO processo_contadores (empresa_id, ultimo_seq)
  VALUES (NEW.empresa_id, 1)
  ON CONFLICT (empresa_id) DO UPDATE
    SET ultimo_seq = processo_contadores.ultimo_seq + 1
  RETURNING ultimo_seq INTO v_seq;

  NEW.numero_processo := '#proc-' || LPAD(v_seq::TEXT, 3, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_gerar_numero_processo
  BEFORE INSERT ON processos
  FOR EACH ROW
  WHEN (NEW.numero_processo IS NULL OR NEW.numero_processo = '')
  EXECUTE FUNCTION gerar_numero_processo();

CREATE POLICY "processos_select" ON processos
  FOR SELECT
  USING (
    empresa_id IN (
      SELECT empresa_id FROM usuarios
      WHERE id = auth.uid() AND ativo = true
    )
    AND deleted_at IS NULL
  );

CREATE POLICY "processos_insert" ON processos
  FOR INSERT
  WITH CHECK (
    empresa_id IN (
      SELECT empresa_id FROM usuarios
      WHERE id = auth.uid()
        AND ativo = true
        AND perfil IN ('analista', 'consultor', 'gerente', 'admin')
    )
  );

CREATE POLICY "processos_update" ON processos
  FOR UPDATE
  USING (
    empresa_id IN (
      SELECT empresa_id FROM usuarios u
      WHERE u.id = auth.uid()
        AND u.ativo = true
        AND (
          u.id = processos.operacional_id
          OR u.perfil IN ('gerente', 'admin')
        )
    )
    AND deleted_at IS NULL
  );

CREATE TABLE IF NOT EXISTS processo_comentarios (
  id                UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        UUID              NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  processo_id       UUID              NOT NULL REFERENCES processos(id) ON DELETE CASCADE,
  usuario_id        UUID              NOT NULL REFERENCES usuarios(id),
  tipo              tipo_comentario   NOT NULL DEFAULT 'observacao',
  texto             TEXT              NOT NULL,
  notificar_cliente BOOLEAN           NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ       NOT NULL DEFAULT now()
);

ALTER TABLE processo_comentarios ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_proc_coment_processo ON processo_comentarios(processo_id);
CREATE INDEX idx_proc_coment_empresa ON processo_comentarios(empresa_id);

CREATE POLICY "proc_coment_select" ON processo_comentarios
  FOR SELECT
  USING (
    empresa_id IN (
      SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true
    )
  );

CREATE POLICY "proc_coment_insert" ON processo_comentarios
  FOR INSERT
  WITH CHECK (
    usuario_id = auth.uid()
    AND empresa_id IN (
      SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true
    )
  );

CREATE TABLE IF NOT EXISTS processo_tarefas (
  id              UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID              NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  processo_id     UUID              NOT NULL REFERENCES processos(id) ON DELETE CASCADE,
  criado_por      UUID              NOT NULL REFERENCES usuarios(id),
  responsavel_id  UUID              REFERENCES usuarios(id),
  titulo          TEXT              NOT NULL,
  descricao       TEXT,
  prioridade      prioridade_tarefa NOT NULL DEFAULT 'media',
  concluida       BOOLEAN           NOT NULL DEFAULT false,
  data_vencimento DATE,
  vencimento      DATE,
  concluida_em    TIMESTAMPTZ,
  concluida_por   UUID              REFERENCES usuarios(id),
  created_at      TIMESTAMPTZ       NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ       NOT NULL DEFAULT now()
);

ALTER TABLE processo_tarefas ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_proc_tarefas_processo ON processo_tarefas(processo_id);
CREATE INDEX idx_proc_tarefas_empresa ON processo_tarefas(empresa_id);
CREATE INDEX idx_proc_tarefas_resp ON processo_tarefas(responsavel_id) WHERE concluida = false;

CREATE TRIGGER trg_proc_tarefas_updated_at
  BEFORE UPDATE ON processo_tarefas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE POLICY "proc_tarefas_select" ON processo_tarefas
  FOR SELECT
  USING (
    empresa_id IN (
      SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true
    )
  );

CREATE POLICY "proc_tarefas_insert" ON processo_tarefas
  FOR INSERT
  WITH CHECK (
    criado_por = auth.uid()
    AND empresa_id IN (
      SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true
    )
  );

CREATE POLICY "proc_tarefas_update" ON processo_tarefas
  FOR UPDATE
  USING (
    empresa_id IN (
      SELECT empresa_id FROM usuarios u
      WHERE u.id = auth.uid()
        AND u.ativo = true
        AND (
          u.id = processo_tarefas.responsavel_id
          OR u.id = processo_tarefas.criado_por
          OR u.perfil IN ('gerente', 'admin')
        )
    )
  );

CREATE POLICY "proc_tarefas_delete" ON processo_tarefas
  FOR DELETE
  USING (
    empresa_id IN (
      SELECT empresa_id FROM usuarios u
      WHERE u.id = auth.uid()
        AND u.ativo = true
        AND (
          u.id = processo_tarefas.criado_por
          OR u.perfil = 'admin'
        )
    )
  );

CREATE TABLE IF NOT EXISTS processo_fases_historico (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID          NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  processo_id     UUID          NOT NULL REFERENCES processos(id) ON DELETE CASCADE,
  fase_id         UUID          NOT NULL REFERENCES fases(id),
  usuario_id      UUID          NOT NULL REFERENCES usuarios(id),
  observacao      TEXT,
  entrou_em       TIMESTAMPTZ   NOT NULL DEFAULT now()
);

ALTER TABLE processo_fases_historico ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_proc_fases_hist_processo ON processo_fases_historico(processo_id);
CREATE INDEX idx_proc_fases_hist_empresa ON processo_fases_historico(empresa_id);

CREATE POLICY "proc_fases_hist_select" ON processo_fases_historico
  FOR SELECT
  USING (
    empresa_id IN (
      SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true
    )
  );

CREATE POLICY "proc_fases_hist_insert" ON processo_fases_historico
  FOR INSERT
  WITH CHECK (
    usuario_id = auth.uid()
    AND empresa_id IN (
      SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true
    )
  );

CREATE TABLE IF NOT EXISTS processo_compradores (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID        NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  processo_id     UUID        NOT NULL REFERENCES processos(id) ON DELETE CASCADE,
  nome            TEXT        NOT NULL,
  cpf             TEXT,
  email           TEXT,
  telefone        TEXT,
  renda_mensal    NUMERIC(15,2),
  principal       BOOLEAN     NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE processo_compradores ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_proc_compradores_processo ON processo_compradores(processo_id);

CREATE TRIGGER trg_proc_compradores_updated_at
  BEFORE UPDATE ON processo_compradores
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE POLICY "proc_compradores_select" ON processo_compradores
  FOR SELECT USING (empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true));
CREATE POLICY "proc_compradores_insert" ON processo_compradores
  FOR INSERT WITH CHECK (empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true));
CREATE POLICY "proc_compradores_update" ON processo_compradores
  FOR UPDATE USING (empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true AND perfil IN ('analista','gerente','admin')));
CREATE POLICY "proc_compradores_delete" ON processo_compradores
  FOR DELETE USING (empresa_id IN (SELECT empresa_id FROM usuarios u WHERE u.id = auth.uid() AND u.ativo = true AND u.perfil IN ('gerente','admin')));

CREATE TABLE IF NOT EXISTS processo_vendedores (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID        NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  processo_id     UUID        NOT NULL REFERENCES processos(id) ON DELETE CASCADE,
  nome            TEXT        NOT NULL,
  cpf             TEXT,
  email           TEXT,
  telefone        TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE processo_vendedores ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_proc_vendedores_processo ON processo_vendedores(processo_id);

CREATE TRIGGER trg_proc_vendedores_updated_at
  BEFORE UPDATE ON processo_vendedores
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE POLICY "proc_vendedores_select" ON processo_vendedores
  FOR SELECT USING (empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true));
CREATE POLICY "proc_vendedores_insert" ON processo_vendedores
  FOR INSERT WITH CHECK (empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true));
CREATE POLICY "proc_vendedores_update" ON processo_vendedores
  FOR UPDATE USING (empresa_id IN (SELECT empresa_id FROM usuarios u WHERE u.id = auth.uid() AND u.ativo = true AND u.perfil IN ('analista','gerente','admin')));
CREATE POLICY "proc_vendedores_delete" ON processo_vendedores
  FOR DELETE USING (empresa_id IN (SELECT empresa_id FROM usuarios u WHERE u.id = auth.uid() AND u.ativo = true AND u.perfil IN ('gerente','admin')));

CREATE TABLE IF NOT EXISTS processo_conta_movimentos (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID        NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  processo_id     UUID        NOT NULL REFERENCES processos(id) ON DELETE CASCADE,
  tipo            TEXT        NOT NULL CHECK (tipo IN ('credito', 'debito')),
  descricao       TEXT        NOT NULL,
  valor           NUMERIC(15,2) NOT NULL CHECK (valor > 0),
  data_movimento  DATE        NOT NULL DEFAULT CURRENT_DATE,
  usuario_id      UUID        NOT NULL REFERENCES usuarios(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE processo_conta_movimentos ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_proc_conta_mov_processo ON processo_conta_movimentos(processo_id);

CREATE POLICY "proc_conta_mov_select" ON processo_conta_movimentos
  FOR SELECT USING (empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true));
CREATE POLICY "proc_conta_mov_insert" ON processo_conta_movimentos
  FOR INSERT WITH CHECK (usuario_id = auth.uid() AND empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true AND perfil IN ('analista','gerente','admin')));

CREATE TABLE IF NOT EXISTS processo_custas (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID        NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  processo_id     UUID        NOT NULL REFERENCES processos(id) ON DELETE CASCADE,
  descricao       TEXT        NOT NULL,
  valor           NUMERIC(15,2) NOT NULL,
  data_custa      DATE        NOT NULL DEFAULT CURRENT_DATE,
  pago            BOOLEAN     NOT NULL DEFAULT false,
  usuario_id      UUID        NOT NULL REFERENCES usuarios(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE processo_custas ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_proc_custas_processo ON processo_custas(processo_id);

CREATE TRIGGER trg_proc_custas_updated_at
  BEFORE UPDATE ON processo_custas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE POLICY "proc_custas_select" ON processo_custas
  FOR SELECT USING (empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true));
CREATE POLICY "proc_custas_insert" ON processo_custas
  FOR INSERT WITH CHECK (empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true AND perfil IN ('analista','gerente','admin')));
CREATE POLICY "proc_custas_update" ON processo_custas
  FOR UPDATE USING (empresa_id IN (SELECT empresa_id FROM usuarios u WHERE u.id = auth.uid() AND u.ativo = true AND u.perfil IN ('analista','gerente','admin')));

CREATE OR REPLACE FUNCTION atualizar_saldo_conta()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_saldo NUMERIC(15,2);
  v_processo_id UUID;
  v_empresa_id UUID;
BEGIN
  v_processo_id := COALESCE(NEW.processo_id, OLD.processo_id);

  SELECT empresa_id INTO v_empresa_id FROM processos WHERE id = v_processo_id;

  IF NOT EXISTS (
    SELECT 1 FROM usuarios
    WHERE id = auth.uid() AND empresa_id = v_empresa_id AND ativo = true
  ) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT COALESCE(SUM(
    CASE WHEN tipo = 'credito' THEN valor ELSE -valor END
  ), 0)
  INTO v_saldo
  FROM processo_conta_movimentos
  WHERE processo_id = v_processo_id;

  UPDATE processos
  SET saldo_conta = v_saldo
  WHERE id = v_processo_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_atualizar_saldo_conta
  AFTER INSERT OR UPDATE OR DELETE ON processo_conta_movimentos
  FOR EACH ROW EXECUTE FUNCTION atualizar_saldo_conta();

CREATE OR REPLACE FUNCTION resumo_estoque(p_empresa_id UUID)
RETURNS TABLE (
  certeza_qtd      BIGINT,
  certeza_valor    NUMERIC,
  incerteza_qtd    BIGINT,
  incerteza_valor  NUMERIC,
  total_qtd        BIGINT,
  total_valor      NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM usuarios
    WHERE id = auth.uid() AND empresa_id = p_empresa_id AND ativo = true
  ) THEN
    RAISE EXCEPTION 'Acesso negado: empresa_id inválido para este usuário';
  END IF;

  RETURN QUERY
  SELECT
    COUNT(*) FILTER (WHERE chance_emissao = 'certeza')           AS certeza_qtd,
    COALESCE(SUM(valor_financiado) FILTER (WHERE chance_emissao = 'certeza'), 0) AS certeza_valor,
    COUNT(*) FILTER (WHERE chance_emissao = 'incerteza')         AS incerteza_qtd,
    COALESCE(SUM(valor_financiado) FILTER (WHERE chance_emissao = 'incerteza'), 0) AS incerteza_valor,
    COUNT(*)                                                      AS total_qtd,
    COALESCE(SUM(valor_financiado), 0)                           AS total_valor
  FROM processos
  WHERE empresa_id = p_empresa_id
    AND deleted_at IS NULL
    AND status_processo NOT IN ('reprovado', 'cancelado');
END;
$$;

-- View dashboard_kpis atualizada com processos reais
DROP VIEW IF EXISTS dashboard_kpis;

CREATE VIEW dashboard_kpis AS
SELECT
  e.id                                          AS empresa_id,
  COUNT(p.id) FILTER (
    WHERE p.deleted_at IS NULL
  )                                             AS total_processos,
  COUNT(p.id) FILTER (
    WHERE p.deleted_at IS NULL
    AND p.status_processo = 'em_analise'
  )                                             AS processos_em_analise,
  COUNT(p.id) FILTER (
    WHERE p.deleted_at IS NULL
    AND p.status_processo = 'aprovado'
  )                                             AS processos_aprovados,
  COUNT(p.id) FILTER (
    WHERE p.deleted_at IS NULL
    AND p.status_emissao = 'emitido'
    AND EXTRACT(MONTH FROM p.data_emissao) = EXTRACT(MONTH FROM now())
    AND EXTRACT(YEAR FROM p.data_emissao) = EXTRACT(YEAR FROM now())
  )                                             AS emissoes_mes_atual,
  COALESCE(SUM(p.valor_financiado) FILTER (
    WHERE p.deleted_at IS NULL
    AND p.status_emissao = 'emitido'
    AND EXTRACT(MONTH FROM p.data_emissao) = EXTRACT(MONTH FROM now())
    AND EXTRACT(YEAR FROM p.data_emissao) = EXTRACT(YEAR FROM now())
  ), 0)                                         AS valor_emitido_mes,
  COUNT(p.id) FILTER (
    WHERE p.deleted_at IS NULL
    AND p.chance_emissao = 'certeza'
    AND p.status_processo NOT IN ('reprovado', 'cancelado')
  )                                             AS estoque_certeza,
  COUNT(l.id) FILTER (
    WHERE l.deleted_at IS NULL
  )                                             AS total_leads,
  COUNT(l.id) FILTER (
    WHERE l.deleted_at IS NULL
    AND DATE_TRUNC('month', l.created_at) = DATE_TRUNC('month', now())
  )                                             AS leads_mes_atual
FROM empresas e
LEFT JOIN processos p ON p.empresa_id = e.id
LEFT JOIN leads l ON l.empresa_id = e.id
GROUP BY e.id;

GRANT SELECT ON dashboard_kpis TO authenticated;
GRANT EXECUTE ON FUNCTION resumo_estoque(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION gerar_numero_processo() TO authenticated;
GRANT EXECUTE ON FUNCTION atualizar_saldo_conta() TO authenticated;
