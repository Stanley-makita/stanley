-- ============================================================
-- Migration: 20260415_004_leads
-- Módulo: Leads (Kanban)
-- ============================================================

CREATE TYPE lead_origem AS ENUM (
  'indicacao', 'site', 'whatsapp', 'instagram', 'facebook', 'outros'
);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE leads (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        UUID          NOT NULL REFERENCES empresas(id)  ON DELETE RESTRICT,
  nome              TEXT          NOT NULL,
  telefone          TEXT          NOT NULL,
  email             TEXT,
  cpf               TEXT,
  fase_id           UUID          NOT NULL REFERENCES fases(id)     ON DELETE RESTRICT,
  responsavel_id    UUID          REFERENCES usuarios(id)           ON DELETE SET NULL,
  origem            lead_origem   NOT NULL,
  valor_pretendido  NUMERIC(15,2),
  observacoes       TEXT,
  ordem_kanban      INTEGER       NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_leads_empresa_id       ON leads(empresa_id);
CREATE INDEX idx_leads_fase_kanban      ON leads(empresa_id, fase_id, ordem_kanban)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_leads_responsavel      ON leads(responsavel_id) WHERE responsavel_id IS NOT NULL;
CREATE INDEX idx_leads_created_at       ON leads(empresa_id, created_at DESC) WHERE deleted_at IS NULL;

CREATE TRIGGER leads_set_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TYPE lead_historico_tipo AS ENUM (
  'criacao',
  'fase_mudanca',
  'edicao',
  'comentario'
);

CREATE TABLE lead_historico (
  id                UUID                  PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id           UUID                  NOT NULL REFERENCES leads(id)   ON DELETE RESTRICT,
  empresa_id        UUID                  NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
  usuario_id        UUID                  REFERENCES usuarios(id)          ON DELETE SET NULL,
  tipo              lead_historico_tipo   NOT NULL,
  fase_anterior_id  UUID                  REFERENCES fases(id) ON DELETE SET NULL,
  fase_nova_id      UUID                  REFERENCES fases(id) ON DELETE SET NULL,
  descricao         TEXT,
  created_at        TIMESTAMPTZ           NOT NULL DEFAULT now()
);

ALTER TABLE lead_historico ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_lead_historico_lead_id    ON lead_historico(lead_id);
CREATE INDEX idx_lead_historico_empresa_id ON lead_historico(empresa_id, created_at DESC);

CREATE OR REPLACE FUNCTION registrar_criacao_lead()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO lead_historico (
    lead_id, empresa_id, usuario_id, tipo, fase_nova_id, descricao
  ) VALUES (
    NEW.id,
    NEW.empresa_id,
    (SELECT id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1),
    'criacao',
    NEW.fase_id,
    'Lead criado'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_lead_criado
  AFTER INSERT ON leads
  FOR EACH ROW EXECUTE FUNCTION registrar_criacao_lead();

CREATE OR REPLACE FUNCTION registrar_mudanca_fase_lead()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.fase_id IS DISTINCT FROM NEW.fase_id THEN
    INSERT INTO lead_historico (
      lead_id, empresa_id, usuario_id, tipo,
      fase_anterior_id, fase_nova_id, descricao
    ) VALUES (
      NEW.id,
      NEW.empresa_id,
      (SELECT id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1),
      'fase_mudanca',
      OLD.fase_id,
      NEW.fase_id,
      NULL
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_lead_fase_mudanca
  AFTER UPDATE OF fase_id ON leads
  FOR EACH ROW EXECUTE FUNCTION registrar_mudanca_fase_lead();

CREATE POLICY "leads_select_empresa" ON leads
  FOR SELECT USING (
    empresa_id = (
      SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1
    )
    AND deleted_at IS NULL
  );

CREATE POLICY "leads_insert_equipe" ON leads
  FOR INSERT WITH CHECK (
    empresa_id = (
      SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1
    )
    AND (
      SELECT perfil FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1
    ) IN ('admin', 'gerente', 'analista', 'consultor')
  );

CREATE POLICY "leads_update_responsavel_ou_gerencia" ON leads
  FOR UPDATE
  USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
    AND (
      responsavel_id = (SELECT id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
      OR (SELECT perfil FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1) IN ('admin', 'gerente')
    )
  )
  WITH CHECK (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
  );

CREATE POLICY "lead_historico_select_empresa" ON lead_historico
  FOR SELECT USING (
    empresa_id = (
      SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1
    )
  );

REVOKE INSERT ON lead_historico FROM authenticated;

CREATE OR REPLACE FUNCTION mover_lead_kanban(
  p_lead_id          UUID,
  p_fase_id_destino  UUID,
  p_ordem_destino    INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa_id       UUID;
  v_fase_id_origem   UUID;
BEGIN
  SELECT empresa_id, fase_id
  INTO v_empresa_id, v_fase_id_origem
  FROM leads
  WHERE id = p_lead_id
    AND deleted_at IS NULL;

  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'Lead não encontrado';
  END IF;

  IF v_empresa_id != (
    SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1
  ) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  UPDATE leads
  SET ordem_kanban = ordem_kanban + 1
  WHERE empresa_id    = v_empresa_id
    AND fase_id       = p_fase_id_destino
    AND ordem_kanban  >= p_ordem_destino
    AND id            != p_lead_id
    AND deleted_at    IS NULL;

  UPDATE leads
  SET fase_id       = p_fase_id_destino,
      ordem_kanban  = p_ordem_destino,
      updated_at    = now()
  WHERE id = p_lead_id;

  WITH reordenados AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY ordem_kanban) - 1 AS nova_ordem
    FROM leads
    WHERE empresa_id = v_empresa_id
      AND fase_id    = v_fase_id_origem
      AND id         != p_lead_id
      AND deleted_at IS NULL
  )
  UPDATE leads l
  SET ordem_kanban = r.nova_ordem
  FROM reordenados r
  WHERE l.id = r.id;
END;
$$;

-- Atualizar view dashboard_kpis com leads reais
DROP VIEW IF EXISTS dashboard_kpis;
CREATE VIEW dashboard_kpis AS
SELECT
  u.empresa_id,
  COUNT(DISTINCT u.id) FILTER (
    WHERE u.ativo = true AND u.deleted_at IS NULL
  )::int AS membros_ativos,
  0::int     AS processos_ativos,
  0::int     AS processos_mes,
  0::numeric AS valor_carteira,
  COUNT(DISTINCT l.id) FILTER (
    WHERE l.deleted_at IS NULL
  )::int AS leads_total,
  COUNT(DISTINCT l.id) FILTER (
    WHERE l.deleted_at IS NULL
    AND l.created_at >= date_trunc('month', now())
  )::int AS leads_mes
FROM usuarios u
LEFT JOIN leads l ON l.empresa_id = u.empresa_id
WHERE u.deleted_at IS NULL
GROUP BY u.empresa_id;
