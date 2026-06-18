-- ============================================================
-- Módulo Recursos Humanos
-- ============================================================

-- ENUMS
CREATE TYPE rh_tipo_contrato AS ENUM ('clt','pj','temporario','estagio');
CREATE TYPE rh_status_funcionario AS ENUM ('ativo','ferias','afastado','inativo');
CREATE TYPE rh_nivel_comissao AS ENUM ('sem_comissao','junior','pleno','senior','gerente');
CREATE TYPE rh_status_ferias AS ENUM ('agendado','em_andamento','concluido','cancelado');
CREATE TYPE rh_tipo_ausencia AS ENUM ('licenca','atestado','falta_justificada','falta_injustificada','outros');

-- ── Departamentos ────────────────────────────────────────────
CREATE TABLE rh_departamentos (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID        NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome        TEXT        NOT NULL,
  descricao   TEXT,
  ativo       BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rh_dep_empresa ON rh_departamentos(empresa_id) WHERE ativo = true;

ALTER TABLE rh_departamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY rh_dep_empresa ON rh_departamentos FOR ALL
  USING (empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() AND ativo = true LIMIT 1));

-- ── Regras de Comissão ───────────────────────────────────────
CREATE TABLE rh_regras_comissao (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID        NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome          TEXT        NOT NULL,
  descricao     TEXT,
  data_inicio   DATE        NOT NULL,
  data_termino  DATE,
  ativa         BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rh_regra_empresa ON rh_regras_comissao(empresa_id) WHERE ativa = true;

ALTER TABLE rh_regras_comissao ENABLE ROW LEVEL SECURITY;
CREATE POLICY rh_regra_empresa ON rh_regras_comissao FOR ALL
  USING (empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() AND ativo = true LIMIT 1));

-- ── Faixas de Comissão ───────────────────────────────────────
CREATE TABLE rh_faixas_comissao (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  regra_id      UUID        NOT NULL REFERENCES rh_regras_comissao(id) ON DELETE CASCADE,
  valor_minimo  NUMERIC(14,2) NOT NULL DEFAULT 0,
  valor_maximo  NUMERIC(14,2) NOT NULL DEFAULT 0, -- 0 = sem limite
  percentual    NUMERIC(6,3) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rh_faixa_regra ON rh_faixas_comissao(regra_id);

ALTER TABLE rh_faixas_comissao ENABLE ROW LEVEL SECURITY;
CREATE POLICY rh_faixa_empresa ON rh_faixas_comissao FOR ALL
  USING (regra_id IN (
    SELECT id FROM rh_regras_comissao
    WHERE empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() AND ativo = true LIMIT 1)
  ));

-- ── Cargos ───────────────────────────────────────────────────
CREATE TABLE rh_cargos (
  id                  UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          UUID              NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome                TEXT              NOT NULL,
  descricao           TEXT,
  departamento_id     UUID              REFERENCES rh_departamentos(id) ON DELETE SET NULL,
  nivel_comissao      rh_nivel_comissao NOT NULL DEFAULT 'sem_comissao',
  regra_comissao_id   UUID              REFERENCES rh_regras_comissao(id) ON DELETE SET NULL,
  ativo               BOOLEAN           NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ       NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ       NOT NULL DEFAULT now()
);

CREATE INDEX idx_rh_cargo_empresa ON rh_cargos(empresa_id) WHERE ativo = true;

ALTER TABLE rh_cargos ENABLE ROW LEVEL SECURITY;
CREATE POLICY rh_cargo_empresa ON rh_cargos FOR ALL
  USING (empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() AND ativo = true LIMIT 1));

-- ── Funcionários ─────────────────────────────────────────────
CREATE TABLE rh_funcionarios (
  id                UUID                  PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        UUID                  NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome              TEXT                  NOT NULL,
  cpf               TEXT,
  email             TEXT                  NOT NULL,
  telefone          TEXT,
  data_nascimento   DATE,
  data_admissao     DATE                  NOT NULL,
  tipo_contrato     rh_tipo_contrato      NOT NULL DEFAULT 'clt',
  cargo_id          UUID                  REFERENCES rh_cargos(id) ON DELETE SET NULL,
  status            rh_status_funcionario NOT NULL DEFAULT 'ativo',
  salario_base      NUMERIC(12,2)         NOT NULL DEFAULT 0,
  observacoes       TEXT,
  created_at        TIMESTAMPTZ           NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ           NOT NULL DEFAULT now()
);

CREATE INDEX idx_rh_func_empresa ON rh_funcionarios(empresa_id);
CREATE INDEX idx_rh_func_status  ON rh_funcionarios(empresa_id, status);

CREATE TRIGGER rh_func_updated_at
  BEFORE UPDATE ON rh_funcionarios
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE rh_funcionarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY rh_func_empresa ON rh_funcionarios FOR ALL
  USING (empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() AND ativo = true LIMIT 1));

-- ── Empresas vinculadas ao funcionário ───────────────────────
CREATE TABLE rh_funcionario_empresas (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  funcionario_id          UUID        NOT NULL REFERENCES rh_funcionarios(id) ON DELETE CASCADE,
  empresa_vinculada_nome  TEXT        NOT NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE rh_funcionario_empresas ENABLE ROW LEVEL SECURITY;
CREATE POLICY rh_func_emp_empresa ON rh_funcionario_empresas FOR ALL
  USING (funcionario_id IN (
    SELECT id FROM rh_funcionarios
    WHERE empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() AND ativo = true LIMIT 1)
  ));

-- ── Ponto ────────────────────────────────────────────────────
CREATE TABLE rh_ponto (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          UUID        NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  funcionario_id      UUID        NOT NULL REFERENCES rh_funcionarios(id) ON DELETE CASCADE,
  data                DATE        NOT NULL,
  entrada             TIME,
  inicio_intervalo    TIME,
  fim_intervalo       TIME,
  saida               TIME,
  observacao          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(funcionario_id, data)
);

CREATE INDEX idx_rh_ponto_empresa_data ON rh_ponto(empresa_id, data);
CREATE INDEX idx_rh_ponto_func_data    ON rh_ponto(funcionario_id, data);

CREATE TRIGGER rh_ponto_updated_at
  BEFORE UPDATE ON rh_ponto
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE rh_ponto ENABLE ROW LEVEL SECURITY;
CREATE POLICY rh_ponto_empresa ON rh_ponto FOR ALL
  USING (empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() AND ativo = true LIMIT 1));

-- ── Férias ───────────────────────────────────────────────────
CREATE TABLE rh_ferias (
  id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          UUID            NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  funcionario_id      UUID            NOT NULL REFERENCES rh_funcionarios(id) ON DELETE CASCADE,
  periodo_aq_inicio   DATE            NOT NULL,
  periodo_aq_fim      DATE            NOT NULL,
  ferias_inicio       DATE,
  ferias_fim          DATE,
  dias_totais         INTEGER         NOT NULL DEFAULT 30,
  dias_usados         INTEGER         NOT NULL DEFAULT 0,
  status              rh_status_ferias NOT NULL DEFAULT 'agendado',
  observacoes         TEXT,
  created_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ     NOT NULL DEFAULT now()
);

CREATE INDEX idx_rh_ferias_empresa ON rh_ferias(empresa_id);
CREATE INDEX idx_rh_ferias_func    ON rh_ferias(funcionario_id);

CREATE TRIGGER rh_ferias_updated_at
  BEFORE UPDATE ON rh_ferias
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE rh_ferias ENABLE ROW LEVEL SECURITY;
CREATE POLICY rh_ferias_empresa ON rh_ferias FOR ALL
  USING (empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() AND ativo = true LIMIT 1));

-- ── Ausências ────────────────────────────────────────────────
CREATE TABLE rh_ausencias (
  id              UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID              NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  funcionario_id  UUID              NOT NULL REFERENCES rh_funcionarios(id) ON DELETE CASCADE,
  data_inicio     DATE              NOT NULL,
  data_fim        DATE              NOT NULL,
  tipo            rh_tipo_ausencia  NOT NULL DEFAULT 'outros',
  motivo          TEXT,
  created_at      TIMESTAMPTZ       NOT NULL DEFAULT now()
);

CREATE INDEX idx_rh_aus_empresa ON rh_ausencias(empresa_id);
CREATE INDEX idx_rh_aus_func    ON rh_ausencias(funcionario_id);

ALTER TABLE rh_ausencias ENABLE ROW LEVEL SECURITY;
CREATE POLICY rh_aus_empresa ON rh_ausencias FOR ALL
  USING (empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() AND ativo = true LIMIT 1));
