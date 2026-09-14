-- Um comercial faz Financiamento + CGI + Consórcio (às vezes Contrato
-- também) — cada um com sua própria regra de comissão. Hoje
-- rh_funcionarios/rh_cargos só têm 1 regra_comissao_id (e o CGI nem é uma
-- regra própria, é um campo dentro da regra de Financiamento). Já tinha
-- sido combinado que isso precisava virar múltiplas regras por
-- funcionário. Decisões confirmadas com o usuário:
--   1. Seleção automática por CATEGORIA da regra (Financiamento, CGI,
--      Consórcio, Contrato, Outra) — até 1 regra ativa por categoria,
--      até 5 no total. Sem tela nova de "qual regra usar quando": a
--      categoria já amarra a regra à modalidade do processo.
--   2. CGI vira regra própria e separada (tipo_calculo novo
--      'cgi_limite_percentual'), em vez de campo dentro da regra de
--      Financiamento.
--
-- ============================================================
-- 0. Schema: categoria em rh_regras_comissao, tabelas de vínculo N:N
--    (funcionário/cargo × regra por categoria).
-- ============================================================

ALTER TABLE rh_regras_comissao
  ADD COLUMN IF NOT EXISTS categoria TEXT NOT NULL DEFAULT 'financiamento'
    CHECK (categoria IN ('financiamento', 'cgi', 'consorcio', 'contrato', 'outra'));

ALTER TABLE rh_regras_comissao
  DROP CONSTRAINT IF EXISTS rh_regras_comissao_tipo_calculo_check;
ALTER TABLE rh_regras_comissao
  ADD CONSTRAINT rh_regras_comissao_tipo_calculo_check
  CHECK (tipo_calculo IN ('valor_fixo_emissao', 'percentual_faixa_producao_mensal', 'percentual_por_negocio', 'cgi_limite_percentual'));

-- Backfill de categoria pras regras existentes: 'percentual_por_negocio'
-- foi criado especificamente pra Consórcio (ver migration 268/269) —
-- todas as outras ficam 'financiamento' (default da coluna já cobre).
UPDATE rh_regras_comissao
SET categoria = 'consorcio'
WHERE tipo_calculo = 'percentual_por_negocio';

-- Split do CGI: toda regra de Financiamento com cgi_valor_limite/
-- cgi_percentual_acima preenchidos ganha uma regra-irmã categoria='cgi',
-- e os funcionários/cargos que apontavam pra ela (via regra_comissao_id)
-- passam a apontar também pra essa regra nova na categoria 'cgi'.
CREATE TEMP TABLE _cgi_split_map (orig_id UUID, cgi_id UUID) ON COMMIT DROP;

-- Loop explícito (em vez de INSERT...RETURNING casado por nome) pra não
-- correr risco de mapear errado caso duas regras da mesma empresa
-- tenham o mesmo nome.
DO $$
DECLARE
  o RECORD;
  v_novo_id UUID;
BEGIN
  FOR o IN
    SELECT id, empresa_id, nome, data_inicio, data_termino, ativa,
           cgi_valor_limite, cgi_percentual_acima
    FROM rh_regras_comissao
    WHERE categoria = 'financiamento'
      AND cgi_valor_limite IS NOT NULL
      AND cgi_percentual_acima IS NOT NULL
  LOOP
    INSERT INTO rh_regras_comissao (
      empresa_id, nome, descricao, data_inicio, data_termino, ativa,
      categoria, tipo_calculo, cgi_valor_limite, cgi_percentual_acima
    ) VALUES (
      o.empresa_id, o.nome || ' — CGI', 'Extraída automaticamente da regra "' || o.nome || '" (migration 307).',
      o.data_inicio, o.data_termino, o.ativa,
      'cgi', 'cgi_limite_percentual', o.cgi_valor_limite, o.cgi_percentual_acima
    )
    RETURNING id INTO v_novo_id;

    INSERT INTO _cgi_split_map (orig_id, cgi_id) VALUES (o.id, v_novo_id);
  END LOOP;
END $$;

-- Regra original vira só Financiamento — não carrega mais os campos de
-- CGI (agora vivem na regra-irmã).
UPDATE rh_regras_comissao
SET cgi_valor_limite = NULL, cgi_percentual_acima = NULL
WHERE id IN (SELECT orig_id FROM _cgi_split_map);

CREATE TABLE IF NOT EXISTS rh_funcionario_regras (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  funcionario_id UUID        NOT NULL REFERENCES rh_funcionarios(id) ON DELETE CASCADE,
  regra_id       UUID        NOT NULL REFERENCES rh_regras_comissao(id) ON DELETE CASCADE,
  -- Cópia da categoria da regra vinculada, sincronizada por trigger —
  -- existe só pra permitir a constraint UNIQUE abaixo sem subquery.
  categoria      TEXT        NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (funcionario_id, categoria)
);

CREATE TABLE IF NOT EXISTS rh_cargo_regras (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cargo_id     UUID        NOT NULL REFERENCES rh_cargos(id) ON DELETE CASCADE,
  regra_id     UUID        NOT NULL REFERENCES rh_regras_comissao(id) ON DELETE CASCADE,
  categoria    TEXT        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cargo_id, categoria)
);

CREATE OR REPLACE FUNCTION rh_sync_categoria_vinculo()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  SELECT categoria INTO NEW.categoria FROM rh_regras_comissao WHERE id = NEW.regra_id;
  IF NEW.categoria IS NULL THEN
    RAISE EXCEPTION 'Regra de comissão % não encontrada', NEW.regra_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_categoria_func_regra ON rh_funcionario_regras;
CREATE TRIGGER trg_sync_categoria_func_regra
  BEFORE INSERT OR UPDATE OF regra_id ON rh_funcionario_regras
  FOR EACH ROW EXECUTE FUNCTION rh_sync_categoria_vinculo();

DROP TRIGGER IF EXISTS trg_sync_categoria_cargo_regra ON rh_cargo_regras;
CREATE TRIGGER trg_sync_categoria_cargo_regra
  BEFORE INSERT OR UPDATE OF regra_id ON rh_cargo_regras
  FOR EACH ROW EXECUTE FUNCTION rh_sync_categoria_vinculo();

CREATE INDEX IF NOT EXISTS idx_rh_func_regras_func ON rh_funcionario_regras(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_rh_cargo_regras_cargo ON rh_cargo_regras(cargo_id);

ALTER TABLE rh_funcionario_regras ENABLE ROW LEVEL SECURITY;
CREATE POLICY rh_func_regras_empresa ON rh_funcionario_regras FOR ALL
  USING (funcionario_id IN (
    SELECT id FROM rh_funcionarios
    WHERE empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() AND ativo = true LIMIT 1)
  ));

ALTER TABLE rh_cargo_regras ENABLE ROW LEVEL SECURITY;
CREATE POLICY rh_cargo_regras_empresa ON rh_cargo_regras FOR ALL
  USING (cargo_id IN (
    SELECT id FROM rh_cargos
    WHERE empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() AND ativo = true LIMIT 1)
  ));

-- Backfill dos vínculos a partir das FKs únicas existentes (agora
-- deprecated, mantidas só pra rollback/histórico).
INSERT INTO rh_funcionario_regras (funcionario_id, regra_id, categoria)
SELECT f.id, f.regra_comissao_id, r.categoria
FROM rh_funcionarios f
JOIN rh_regras_comissao r ON r.id = f.regra_comissao_id
WHERE f.regra_comissao_id IS NOT NULL
ON CONFLICT (funcionario_id, categoria) DO NOTHING;

-- Funcionários cuja regra original tinha CGI embutido ganham também o
-- vínculo com a regra-irmã de CGI extraída acima.
INSERT INTO rh_funcionario_regras (funcionario_id, regra_id, categoria)
SELECT f.id, m.cgi_id, 'cgi'
FROM rh_funcionarios f
JOIN _cgi_split_map m ON m.orig_id = f.regra_comissao_id
ON CONFLICT (funcionario_id, categoria) DO NOTHING;

INSERT INTO rh_cargo_regras (cargo_id, regra_id, categoria)
SELECT c.id, c.regra_comissao_id, r.categoria
FROM rh_cargos c
JOIN rh_regras_comissao r ON r.id = c.regra_comissao_id
WHERE c.regra_comissao_id IS NOT NULL
ON CONFLICT (cargo_id, categoria) DO NOTHING;

INSERT INTO rh_cargo_regras (cargo_id, regra_id, categoria)
SELECT c.id, m.cgi_id, 'cgi'
FROM rh_cargos c
JOIN _cgi_split_map m ON m.orig_id = c.regra_comissao_id
ON CONFLICT (cargo_id, categoria) DO NOTHING;

-- ============================================================
-- 1. resolver_regra_comissao — funcionário (override) → cargo (default),
--    por categoria. Usada em todo lugar que hoje faz
--    COALESCE(f.regra_comissao_id, c.regra_comissao_id).
-- ============================================================
CREATE OR REPLACE FUNCTION resolver_regra_comissao(
  p_funcionario_id UUID,
  p_categoria      TEXT
)
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (SELECT fr.regra_id FROM rh_funcionario_regras fr
     WHERE fr.funcionario_id = p_funcionario_id AND fr.categoria = p_categoria),
    (SELECT cr.regra_id FROM rh_cargo_regras cr
     JOIN rh_funcionarios f ON f.cargo_id = cr.cargo_id
     WHERE f.id = p_funcionario_id AND cr.categoria = p_categoria)
  );
$$;

GRANT EXECUTE ON FUNCTION resolver_regra_comissao(UUID, TEXT) TO authenticated;

-- ============================================================
-- 2. calcular_producao_comercial_mes — regra de Financiamento e regra de
--    CGI resolvidas separadamente por categoria (antes vinham da MESMA
--    regra_comissao_id).
-- ============================================================
CREATE OR REPLACE FUNCTION calcular_producao_comercial_mes(
  p_empresa_id UUID,
  p_comercial_usuario_id UUID,
  p_mes INTEGER,
  p_ano INTEGER
)
RETURNS TABLE (
  producao_total NUMERIC,
  pct_aplicado   NUMERIC,
  comissao_total NUMERIC,
  regra_id       UUID,
  funcionario_id UUID,
  comissao_faixa NUMERIC,
  cgi_valor_limite NUMERIC,
  cgi_percentual_acima NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_producao_financiamento NUMERIC;
  v_producao_contrato      NUMERIC;
  v_producao_assessoria    NUMERIC;
  v_producao_cgi_especial  NUMERIC;
  v_valor_financiado_bruto NUMERIC;
  v_producao_total         NUMERIC;
  v_func_id                UUID;
  v_func_found             BOOLEAN;
  v_regra_id               UUID;
  v_regra_cgi_id           UUID;
  v_regra                  RECORD;
  v_tipo_calculo           TEXT;
  v_cgi_valor_limite       NUMERIC;
  v_cgi_percentual_acima   NUMERIC;
  v_faixa                  RECORD;
  v_faixa_found            BOOLEAN;
  v_pct                    NUMERIC := 0;
  v_piso                   NUMERIC := 0;
  v_teto                   NUMERIC := 0;
  v_valor_faixa            NUMERIC := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM usuarios WHERE id = auth.uid() AND empresa_id = p_empresa_id AND ativo = true
  ) THEN
    RAISE EXCEPTION 'Acesso negado: empresa_id inválido para este usuário';
  END IF;

  v_func_found := false;
  v_regra_id   := NULL;
  v_regra_cgi_id := NULL;
  v_faixa_found := false;
  v_tipo_calculo         := NULL;
  v_cgi_valor_limite     := NULL;
  v_cgi_percentual_acima := NULL;

  SELECT f.id INTO v_func_id
  FROM usuarios u2
  JOIN rh_funcionarios f ON f.id = u2.funcionario_id
  WHERE u2.id = p_comercial_usuario_id
    AND f.empresa_id = p_empresa_id
    AND f.status = 'ativo'
  LIMIT 1;

  v_func_found := FOUND;

  IF v_func_found THEN
    v_regra_id     := resolver_regra_comissao(v_func_id, 'financiamento');
    v_regra_cgi_id := resolver_regra_comissao(v_func_id, 'cgi');
  END IF;

  IF v_regra_id IS NOT NULL THEN
    SELECT r.tipo_calculo INTO v_tipo_calculo
    FROM rh_regras_comissao r WHERE r.id = v_regra_id;
  END IF;

  IF v_regra_cgi_id IS NOT NULL THEN
    SELECT r.cgi_valor_limite, r.cgi_percentual_acima
    INTO v_cgi_valor_limite, v_cgi_percentual_acima
    FROM rh_regras_comissao r WHERE r.id = v_regra_cgi_id;
  END IF;

  SELECT
    COALESCE(SUM(
      CASE
        WHEN COALESCE(cp.valor_maximo_comissao, 0) > 0
          THEN LEAST(p.valor_financiado * COALESCE(cp.comissao_comercial, 0) / 100, cp.valor_maximo_comissao)
        ELSE p.valor_financiado * COALESCE(cp.comissao_comercial, 0) / 100
      END
    ) FILTER (
      WHERE p.modalidade NOT IN ('Contrato', 'Consorcio')
        AND NOT (
          p.modalidade = 'CGI' AND v_cgi_valor_limite IS NOT NULL
          AND p.valor_financiado > v_cgi_valor_limite
        )
    ), 0),
    COALESCE(SUM(p.valor_contrato) FILTER (WHERE p.modalidade = 'Contrato'), 0),
    COALESCE(SUM(p.valor_assessoria), 0),
    COALESCE(SUM(p.valor_financiado * v_cgi_percentual_acima / 100)
             FILTER (
               WHERE p.modalidade = 'CGI' AND v_cgi_valor_limite IS NOT NULL
                 AND p.valor_financiado > v_cgi_valor_limite
             ), 0),
    COALESCE(SUM(p.valor_financiado)
             FILTER (
               WHERE p.modalidade NOT IN ('Contrato', 'Consorcio')
                 AND NOT (
                   p.modalidade = 'CGI' AND v_cgi_valor_limite IS NOT NULL
                   AND p.valor_financiado > v_cgi_valor_limite
                 )
             ), 0)
  INTO v_producao_financiamento, v_producao_contrato, v_producao_assessoria, v_producao_cgi_especial, v_valor_financiado_bruto
  FROM processos p
  LEFT JOIN LATERAL (
    SELECT x.comissao_comercial, x.valor_maximo_comissao FROM comissoes_padrao x
    WHERE x.banco_id = p.banco_id AND x.empresa_id = p.empresa_id
      AND (x.modalidade = '' OR x.modalidade = p.modalidade::TEXT)
      AND COALESCE(p.valor_financiado, 0) >= x.piso_valor
      AND (x.teto_valor = 0 OR COALESCE(p.valor_financiado, 0) <= x.teto_valor)
    ORDER BY (x.modalidade <> '') DESC, x.piso_valor DESC
    LIMIT 1
  ) cp ON true
  WHERE p.empresa_id = p_empresa_id
    AND p.comercial_id = p_comercial_usuario_id
    AND p.modalidade <> 'Consorcio'
    AND (
      (p.modalidade = 'Contrato'
        AND p.data_pagamento_contrato IS NOT NULL
        AND EXTRACT(MONTH FROM p.data_pagamento_contrato) = p_mes
        AND EXTRACT(YEAR  FROM p.data_pagamento_contrato) = p_ano)
      OR
      (p.modalidade <> 'Contrato'
        AND p.status_emissao = 'emitido'
        AND p.data_emissao IS NOT NULL
        AND EXTRACT(MONTH FROM p.data_emissao) = p_mes
        AND EXTRACT(YEAR  FROM p.data_emissao) = p_ano)
    );

  v_producao_total := v_producao_financiamento + v_producao_contrato + v_producao_assessoria;

  IF v_tipo_calculo = 'percentual_faixa_producao_mensal' THEN
    SELECT *
    INTO v_faixa
    FROM rh_faixas_comissao fx
    WHERE fx.regra_id = v_regra_id
      AND fx.valor_minimo <= v_valor_financiado_bruto
      AND (fx.valor_maximo = 0 OR fx.valor_maximo >= v_valor_financiado_bruto)
    ORDER BY fx.valor_minimo DESC
    LIMIT 1;

    v_faixa_found := FOUND;
    IF v_faixa_found THEN
      v_pct  := COALESCE(v_faixa.pct_comercial, v_faixa.percentual, 0);
      v_piso := COALESCE(v_faixa.piso_valor, 0);
      v_teto := COALESCE(v_faixa.teto_valor, 0);
    END IF;
  END IF;

  v_valor_faixa := v_producao_total * v_pct / 100;

  IF v_piso > 0 THEN v_valor_faixa := GREATEST(v_valor_faixa, v_piso); END IF;
  IF v_teto > 0 THEN v_valor_faixa := LEAST(v_valor_faixa, v_teto); END IF;

  RETURN QUERY SELECT
    v_producao_total,
    v_pct,
    v_valor_faixa + v_producao_cgi_especial,
    v_regra_id,
    CASE WHEN v_func_found THEN v_func_id ELSE NULL END,
    v_valor_faixa,
    v_cgi_valor_limite,
    v_cgi_percentual_acima;
END;
$$;

GRANT EXECUTE ON FUNCTION calcular_producao_comercial_mes(UUID, UUID, INTEGER, INTEGER) TO authenticated;

-- ============================================================
-- 3. gerar_comissoes_a_pagar — bloco COMERCIAL, mesmo ajuste (regra de
--    Financiamento + regra de CGI resolvidas por categoria).
-- ============================================================
CREATE OR REPLACE FUNCTION gerar_comissoes_a_pagar(
  p_fechamento_id UUID
)
RETURNS INTEGER AS $$
DECLARE
  v_fechamento             RECORD;
  v_proc                   RECORD;
  v_com                    RECORD;
  v_func_id                UUID;
  v_faixa                  RECORD;
  v_regra_id               UUID;
  v_regra_cgi_id           UUID;
  v_tipo_calculo           TEXT;
  v_cgi_valor_limite       NUMERIC;
  v_cgi_percentual_acima   NUMERIC;
  v_pct                    NUMERIC;
  v_piso                   NUMERIC;
  v_teto                   NUMERIC;
  v_valor                  NUMERIC;
  v_producao_financiamento NUMERIC;
  v_producao_contrato      NUMERIC;
  v_producao_assessoria    NUMERIC;
  v_producao_cgi_especial  NUMERIC;
  v_valor_financiado_bruto NUMERIC;
  v_producao_total         NUMERIC;
  v_valor_faixa            NUMERIC;
  v_count                  INTEGER := 0;
  v_func_found             BOOLEAN;
  v_faixa_found            BOOLEAN;
BEGIN
  SELECT f.*
  INTO v_fechamento
  FROM financeiro_fechamentos f
  JOIN usuarios u ON u.id = auth.uid()
  WHERE f.id = p_fechamento_id AND f.empresa_id = u.empresa_id AND u.ativo = true;

  IF NOT FOUND THEN RAISE EXCEPTION 'Fechamento não encontrado ou acesso negado'; END IF;
  IF v_fechamento.status = 'travado' THEN RAISE EXCEPTION 'Fechamento travado'; END IF;

  DELETE FROM financeiro_comissoes_pagar
  WHERE fechamento_id = p_fechamento_id AND ajuste_manual = 0;

  FOR v_com IN
    SELECT DISTINCT fp.comercial_id
    FROM financeiro_fechamento_processos fp
    WHERE fp.fechamento_id = p_fechamento_id
      AND fp.comercial_id IS NOT NULL
  LOOP
    v_func_found  := false;
    v_faixa_found := false;
    v_regra_id     := NULL;
    v_regra_cgi_id := NULL;
    v_tipo_calculo         := NULL;
    v_cgi_valor_limite     := NULL;
    v_cgi_percentual_acima := NULL;
    v_pct  := 0;
    v_piso := 0;
    v_teto := 0;

    SELECT f.id INTO v_func_id
    FROM usuarios u2
    JOIN rh_funcionarios f ON f.id = u2.funcionario_id
    WHERE u2.id = v_com.comercial_id
      AND f.empresa_id = v_fechamento.empresa_id
      AND f.status = 'ativo'
    LIMIT 1;

    v_func_found := FOUND;

    IF v_func_found THEN
      v_regra_id     := resolver_regra_comissao(v_func_id, 'financiamento');
      v_regra_cgi_id := resolver_regra_comissao(v_func_id, 'cgi');
    END IF;

    IF v_regra_id IS NOT NULL THEN
      SELECT r.tipo_calculo INTO v_tipo_calculo
      FROM rh_regras_comissao r WHERE r.id = v_regra_id;
    END IF;

    IF v_regra_cgi_id IS NOT NULL THEN
      SELECT r.cgi_valor_limite, r.cgi_percentual_acima
      INTO v_cgi_valor_limite, v_cgi_percentual_acima
      FROM rh_regras_comissao r WHERE r.id = v_regra_cgi_id;
    END IF;

    SELECT
      COALESCE(SUM(
        CASE
          WHEN COALESCE(cp.valor_maximo_comissao, 0) > 0
            THEN LEAST(fp.valor_financiado * COALESCE(cp.comissao_comercial, 0) / 100, cp.valor_maximo_comissao)
          ELSE fp.valor_financiado * COALESCE(cp.comissao_comercial, 0) / 100
        END
      ) FILTER (
        WHERE fp.modalidade NOT IN ('Contrato')
          AND NOT (
            fp.modalidade = 'CGI' AND v_cgi_valor_limite IS NOT NULL
            AND fp.valor_financiado > v_cgi_valor_limite
          )
      ), 0),
      COALESCE(SUM(fp.valor_financiado) FILTER (WHERE fp.modalidade = 'Contrato'), 0),
      COALESCE(SUM(fp.valor_assessoria), 0),
      COALESCE(SUM(fp.valor_financiado * v_cgi_percentual_acima / 100)
               FILTER (
                 WHERE fp.modalidade = 'CGI' AND v_cgi_valor_limite IS NOT NULL
                   AND fp.valor_financiado > v_cgi_valor_limite
               ), 0),
      COALESCE(SUM(fp.valor_financiado)
               FILTER (
                 WHERE fp.modalidade NOT IN ('Contrato')
                   AND NOT (
                     fp.modalidade = 'CGI' AND v_cgi_valor_limite IS NOT NULL
                     AND fp.valor_financiado > v_cgi_valor_limite
                   )
               ), 0)
    INTO v_producao_financiamento, v_producao_contrato, v_producao_assessoria, v_producao_cgi_especial, v_valor_financiado_bruto
    FROM financeiro_fechamento_processos fp
    LEFT JOIN LATERAL (
      SELECT x.comissao_comercial, x.valor_maximo_comissao FROM comissoes_padrao x
      WHERE x.banco_id = fp.banco_id AND x.empresa_id = fp.empresa_id
        AND (x.modalidade = '' OR x.modalidade = fp.modalidade)
        AND COALESCE(fp.valor_financiado, 0) >= x.piso_valor
        AND (x.teto_valor = 0 OR COALESCE(fp.valor_financiado, 0) <= x.teto_valor)
      ORDER BY (x.modalidade <> '') DESC, x.piso_valor DESC
      LIMIT 1
    ) cp ON true
    WHERE fp.fechamento_id = p_fechamento_id
      AND fp.comercial_id = v_com.comercial_id;

    v_producao_total := COALESCE(v_producao_financiamento, 0)
                       + COALESCE(v_producao_contrato, 0)
                       + COALESCE(v_producao_assessoria, 0);

    IF v_tipo_calculo = 'percentual_faixa_producao_mensal' THEN
      SELECT *
      INTO v_faixa
      FROM rh_faixas_comissao
      WHERE regra_id = v_regra_id
        AND valor_minimo <= v_valor_financiado_bruto
        AND (valor_maximo = 0 OR valor_maximo >= v_valor_financiado_bruto)
      ORDER BY valor_minimo DESC
      LIMIT 1;

      v_faixa_found := FOUND;

      IF v_faixa_found THEN
        v_pct  := COALESCE(v_faixa.pct_comercial, v_faixa.percentual, 0);
        v_piso := COALESCE(v_faixa.piso_valor, 0);
        v_teto := COALESCE(v_faixa.teto_valor, 0);
      END IF;
    END IF;

    v_valor_faixa := v_producao_total * v_pct / 100;

    IF v_piso > 0 THEN v_valor_faixa := GREATEST(v_valor_faixa, v_piso); END IF;
    IF v_teto > 0 THEN v_valor_faixa := LEAST(v_valor_faixa, v_teto); END IF;

    v_valor := v_valor_faixa + COALESCE(v_producao_cgi_especial, 0);

    IF v_valor > 0 THEN
      INSERT INTO financeiro_comissoes_pagar (
        empresa_id, fechamento_id, processo_id,
        usuario_id, funcionario_id, tipo_destinatario, papel, regra_id,
        valor_base, percentual, valor_calculado, status
      ) VALUES (
        v_fechamento.empresa_id, p_fechamento_id, NULL,
        v_com.comercial_id,
        CASE WHEN v_func_found THEN v_func_id ELSE NULL END,
        CASE WHEN v_func_found THEN 'funcionario' ELSE 'usuario' END,
        'comercial', v_regra_id,
        v_producao_total, v_pct, v_valor, 'calculada'
      );
      v_count := v_count + 1;
    END IF;

    IF NOT v_func_found THEN
      INSERT INTO financeiro_conferencias (
        empresa_id, fechamento_id, tipo, severidade, status, titulo, descricao,
        entidade_tipo, entidade_id
      ) VALUES (
        v_fechamento.empresa_id, p_fechamento_id, 'comissao_sem_funcionario', 'alerta', 'pendente',
        'Comercial não encontrado no RH',
        'O usuário comercial não possui cadastro ativo no módulo RH para aplicação de regra.',
        'financeiro_fechamento_processos', NULL
      ) ON CONFLICT DO NOTHING;
    END IF;

    IF v_func_found AND v_regra_id IS NULL THEN
      INSERT INTO financeiro_conferencias (
        empresa_id, fechamento_id, tipo, severidade, status, titulo, descricao,
        entidade_tipo, entidade_id
      ) VALUES (
        v_fechamento.empresa_id, p_fechamento_id, 'processo_sem_regra_comissao', 'alerta', 'pendente',
        'Sem regra de comissão',
        'Nem o funcionário nem o cargo do comercial têm regra de Financiamento configurada.',
        'financeiro_fechamento_processos', NULL
      ) ON CONFLICT DO NOTHING;
    END IF;

    IF v_tipo_calculo = 'percentual_faixa_producao_mensal' AND NOT v_faixa_found THEN
      INSERT INTO financeiro_conferencias (
        empresa_id, fechamento_id, tipo, severidade, status, titulo, descricao,
        entidade_tipo, entidade_id
      ) VALUES (
        v_fechamento.empresa_id, p_fechamento_id, 'processo_sem_faixa_comissao', 'alerta', 'pendente',
        'Sem faixa de comissão aplicável',
        'O valor bruto financiado do comercial no mês não se enquadra em nenhuma faixa cadastrada na regra de comissão.',
        'financeiro_fechamento_processos', NULL
      ) ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  -- OPERACIONAL + PARCEIRO: inalterado (não usa regra de RH, usa
  -- comissoes_padrao direto — sem mudança aqui).
  FOR v_proc IN
    SELECT fp.*, p.parceiro_id,
           cp.comissao_operacional, cp.comissao_parceiro, cp.valor_maximo_comissao
    FROM financeiro_fechamento_processos fp
    LEFT JOIN processos p ON p.id = fp.processo_id
    LEFT JOIN LATERAL (
      SELECT x.comissao_operacional, x.comissao_parceiro, x.valor_maximo_comissao
      FROM comissoes_padrao x
      WHERE x.banco_id = fp.banco_id AND x.empresa_id = fp.empresa_id
        AND (x.modalidade = '' OR x.modalidade = fp.modalidade)
        AND COALESCE(fp.valor_financiado, 0) >= x.piso_valor
        AND (x.teto_valor = 0 OR COALESCE(fp.valor_financiado, 0) <= x.teto_valor)
      ORDER BY (x.modalidade <> '') DESC, x.piso_valor DESC
      LIMIT 1
    ) cp ON true
    WHERE fp.fechamento_id = p_fechamento_id
      AND fp.modalidade <> 'Contrato'
  LOOP
    IF v_proc.operacional_id IS NOT NULL AND COALESCE(v_proc.comissao_operacional, 0) > 0 THEN
      v_valor := COALESCE(v_proc.valor_financiado, 0) * COALESCE(v_proc.comissao_operacional, 0) / 100;
      IF COALESCE(v_proc.valor_maximo_comissao, 0) > 0 THEN
        v_valor := LEAST(v_valor, v_proc.valor_maximo_comissao);
      END IF;

      IF v_valor > 0 THEN
        INSERT INTO financeiro_comissoes_pagar (
          empresa_id, fechamento_id, processo_id,
          usuario_id, tipo_destinatario, papel,
          valor_base, percentual, valor_calculado, status
        ) VALUES (
          v_fechamento.empresa_id, p_fechamento_id, v_proc.processo_id,
          v_proc.operacional_id, 'usuario', 'operacional',
          COALESCE(v_proc.valor_financiado, 0), COALESCE(v_proc.comissao_operacional, 0),
          v_valor, 'calculada'
        );
        v_count := v_count + 1;
      END IF;
    END IF;

    IF COALESCE(v_proc.comissao_parceiro, 0) > 0 THEN
      v_valor := COALESCE(v_proc.valor_financiado, 0) * COALESCE(v_proc.comissao_parceiro, 0) / 100;
      IF COALESCE(v_proc.valor_maximo_comissao, 0) > 0 THEN
        v_valor := LEAST(v_valor, v_proc.valor_maximo_comissao);
      END IF;

      IF v_valor > 0 THEN
        INSERT INTO financeiro_comissoes_pagar (
          empresa_id, fechamento_id, processo_id,
          tipo_destinatario, papel, parceiro_id,
          valor_base, percentual, valor_calculado, status
        ) VALUES (
          v_fechamento.empresa_id, p_fechamento_id, v_proc.processo_id,
          'externo', 'parceiro', v_proc.parceiro_id,
          COALESCE(v_proc.valor_financiado, 0),
          COALESCE(v_proc.comissao_parceiro, 0),
          v_valor, 'calculada'
        );
        v_count := v_count + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 4. gerar_fluxo_financeiro_consorcio — resolve a regra de Consórcio por
--    categoria em vez de COALESCE(f.regra_comissao_id, c.regra_comissao_id).
-- ============================================================
CREATE OR REPLACE FUNCTION gerar_fluxo_financeiro_consorcio(p_processo_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_processo        RECORD;
  v_cota             RECORD;
  v_config           RECORD;
  v_func_id          UUID;
  v_regra            RECORD;
  v_faixa            RECORD;
  v_regra_id         UUID;
  v_pct_comercial    NUMERIC(6,3);
  v_data_conclusao   TIMESTAMPTZ := now();
  v_data_ref         DATE;
  v_valor_empresa    NUMERIC(15,2);
  v_valor_comercial  NUMERIC(15,2);
  v_parcela_empresa  NUMERIC(15,2);
  v_parcela_comercial NUMERIC(15,2);
  v_i                INTEGER;
  v_count            INTEGER := 0;
BEGIN
  SELECT p.* INTO v_processo
  FROM processos p
  WHERE p.id = p_processo_id
    AND p.empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Processo não encontrado ou acesso negado';
  END IF;

  IF v_processo.modalidade <> 'Consorcio' THEN
    RAISE EXCEPTION 'Geração de fluxo financeiro de consórcio só se aplica a processos modalidade Consorcio';
  END IF;

  FOR v_cota IN
    SELECT * FROM processo_cotas
    WHERE processo_id = p_processo_id AND status_cota = 'ativo'
  LOOP
    IF v_cota.valor_carta IS NULL OR v_cota.valor_carta <= 0 THEN
      CONTINUE;
    END IF;

    v_data_ref := COALESCE(v_cota.data_pagamento_boleto, CURRENT_DATE);

    SELECT * INTO v_config
    FROM financeiro_config_consorcio
    WHERE empresa_id = v_processo.empresa_id
      AND administradora_nome = v_cota.administradora_nome
      AND (tipo_bem IS NULL OR tipo_bem = v_cota.tipo_bem)
      AND (tipo_parcela IS NULL OR tipo_parcela = v_cota.tipo_parcela)
      AND (data_vigencia_inicio IS NULL OR data_vigencia_inicio <= v_data_ref)
      AND (data_vigencia_fim IS NULL OR data_vigencia_fim >= v_data_ref)
    ORDER BY
      (tipo_bem IS NOT NULL) DESC,
      (tipo_parcela IS NOT NULL) DESC,
      data_vigencia_inicio DESC NULLS LAST
    LIMIT 1;

    IF NOT FOUND THEN
      SELECT * INTO v_config
      FROM financeiro_config_consorcio
      WHERE empresa_id = v_processo.empresa_id
        AND administradora_nome IS NULL AND tipo_bem IS NULL AND tipo_parcela IS NULL
      LIMIT 1;
    END IF;

    v_valor_empresa := round(v_cota.valor_carta * COALESCE(v_config.comissao_total_percentual, 4) / 100, 2);

    -- Comissão do comercial: percentual DIRETO sobre o valor da carta,
    -- resolvido pela regra de categoria 'consorcio' do funcionário
    -- (override) → cargo (default) → faixa pelo valor da carta. Sem
    -- funcionário/regra/faixa aplicável, cai no fallback de
    -- financeiro_config_consorcio (mesmo campo comissao_comercial_percentual
    -- de antes).
    v_pct_comercial := NULL;

    IF v_processo.comercial_id IS NOT NULL THEN
      SELECT f.id INTO v_func_id
      FROM usuarios u2
      JOIN rh_funcionarios f ON f.id = u2.funcionario_id
      WHERE u2.id = v_processo.comercial_id
        AND f.empresa_id = v_processo.empresa_id
        AND f.status = 'ativo'
      LIMIT 1;

      IF FOUND THEN
        v_regra_id := resolver_regra_comissao(v_func_id, 'consorcio');

        IF v_regra_id IS NOT NULL THEN
          SELECT * INTO v_regra FROM rh_regras_comissao WHERE id = v_regra_id AND ativa = true;

          IF FOUND AND v_regra.tipo_calculo = 'percentual_por_negocio' THEN
            SELECT * INTO v_faixa
            FROM rh_faixas_comissao
            WHERE regra_id = v_regra_id
              AND valor_minimo <= v_cota.valor_carta
              AND (valor_maximo = 0 OR valor_maximo >= v_cota.valor_carta)
            ORDER BY valor_minimo DESC
            LIMIT 1;

            IF FOUND THEN
              v_pct_comercial := v_faixa.pct_comercial;
            END IF;
          END IF;
        END IF;
      END IF;
    END IF;

    v_pct_comercial := COALESCE(v_pct_comercial, v_config.comissao_comercial_percentual, 1);
    v_valor_comercial := round(v_cota.valor_carta * v_pct_comercial / 100, 2);

    DECLARE
      v_n INTEGER := COALESCE(v_config.numero_parcelas_padrao, 13);
    BEGIN
      v_parcela_empresa   := round(v_valor_empresa / v_n, 2);
      v_parcela_comercial := round(v_valor_comercial / v_n, 2);

      FOR v_i IN 1..v_n LOOP
        INSERT INTO financeiro_consorcio_receber (
          empresa_id, processo_id, processo_cota_id,
          numero_parcela, total_parcelas, valor_parcela, data_vencimento
        ) VALUES (
          v_processo.empresa_id, p_processo_id, v_cota.id,
          v_i, v_n,
          CASE WHEN v_i = v_n THEN v_valor_empresa - v_parcela_empresa * (v_n - 1) ELSE v_parcela_empresa END,
          (v_data_conclusao + (v_i || ' months')::INTERVAL)::DATE
        )
        ON CONFLICT (processo_cota_id, numero_parcela) DO NOTHING;

        INSERT INTO financeiro_consorcio_comercial_pagar (
          empresa_id, processo_id, processo_cota_id, usuario_id,
          numero_parcela, total_parcelas, valor_parcela, data_vencimento
        ) VALUES (
          v_processo.empresa_id, p_processo_id, v_cota.id, v_processo.comercial_id,
          v_i, v_n,
          CASE WHEN v_i = v_n THEN v_valor_comercial - v_parcela_comercial * (v_n - 1) ELSE v_parcela_comercial END,
          (v_data_conclusao + (v_i || ' months')::INTERVAL)::DATE
        )
        ON CONFLICT (processo_cota_id, numero_parcela) DO NOTHING;

        v_count := v_count + 2;
      END LOOP;
    END;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 5. analise_comissoes_mes — o LATERAL de "cgi_especial" (só usado pra
--    flag informativa da coluna) passa a resolver a regra de CGI por
--    categoria em vez de ler cgi_valor_limite direto da regra de
--    Financiamento (que não tem mais esse campo, foi extraído no passo 0).
-- ============================================================
CREATE OR REPLACE FUNCTION analise_comissoes_mes(
  p_empresa_id UUID,
  p_mes        INTEGER,
  p_ano        INTEGER
)
RETURNS TABLE (
  id                    UUID,
  processo_id           UUID,
  cliente_nome          TEXT,
  cliente_cpf           TEXT,
  banco_nome            TEXT,
  banco_cor             TEXT,
  modalidade            TEXT,
  valor_financiado      NUMERIC,
  comercial_nome        TEXT,
  valor_assessoria      NUMERIC,
  percentual_comissao   NUMERIC,
  comissao              NUMERIC,
  responsavel_registro  TEXT,
  comissao_comercial    NUMERIC,
  cgi_especial          BOOLEAN,
  data_emissao          DATE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.empresa_id = p_empresa_id AND u.ativo = true
  ) THEN
    RAISE EXCEPTION 'Acesso negado: empresa_id inválido para este usuário';
  END IF;

  RETURN QUERY
  SELECT
    p.id                                AS id,
    p.id                                AS processo_id,
    COALESCE(pc.nome, pe.nome, '')      AS cliente_nome,
    COALESCE(pc.cpf, pe.cpf, '')        AS cliente_cpf,
    b.nome                              AS banco_nome,
    b.cor                               AS banco_cor,
    p.modalidade::TEXT                  AS modalidade,
    p.valor_financiado                  AS valor_financiado,
    uc.nome                             AS comercial_nome,
    COALESCE(p.valor_assessoria, 0)     AS valor_assessoria,
    COALESCE(cp.comissao_empresa, 0)    AS percentual_comissao,
    CASE
      WHEN COALESCE(cp.valor_maximo_comissao, 0) > 0
        THEN LEAST(ROUND(COALESCE(p.valor_financiado, 0) * COALESCE(cp.comissao_empresa, 0) / 100, 2), cp.valor_maximo_comissao)
      ELSE ROUND(COALESCE(p.valor_financiado, 0) * COALESCE(cp.comissao_empresa, 0) / 100, 2)
    END                                  AS comissao,
    p.responsavel_registro              AS responsavel_registro,
    comissao_comercial_calculada(p)     AS comissao_comercial,
    COALESCE(
      p.modalidade = 'CGI' AND cgi.cgi_valor_limite IS NOT NULL
      AND p.valor_financiado > cgi.cgi_valor_limite,
      false
    )                                    AS cgi_especial,
    p.data_emissao                      AS data_emissao
  FROM processos p
  LEFT JOIN bancos b ON b.id = p.banco_id
  LEFT JOIN usuarios uc ON uc.id = p.comercial_id
  LEFT JOIN pessoas pe ON pe.id = p.pessoa_id
  LEFT JOIN LATERAL (
    SELECT pcomp.nome, pcomp.cpf FROM processo_compradores pcomp
    WHERE pcomp.processo_id = p.id
    ORDER BY pcomp.principal DESC NULLS LAST, pcomp.created_at ASC LIMIT 1
  ) pc ON true
  LEFT JOIN LATERAL (
    SELECT x.comissao_empresa, x.valor_maximo_comissao FROM comissoes_padrao x
    WHERE x.banco_id = p.banco_id AND x.empresa_id = p.empresa_id
      AND (x.modalidade = '' OR x.modalidade = p.modalidade::TEXT)
      AND COALESCE(p.valor_financiado, 0) >= x.piso_valor
      AND (x.teto_valor = 0 OR COALESCE(p.valor_financiado, 0) <= x.teto_valor)
    ORDER BY (x.modalidade <> '') DESC, x.piso_valor DESC
    LIMIT 1
  ) cp ON true
  LEFT JOIN LATERAL (
    SELECT r.cgi_valor_limite
    FROM usuarios u2
    JOIN rh_funcionarios f ON f.id = u2.funcionario_id
    JOIN rh_regras_comissao r ON r.id = resolver_regra_comissao(f.id, 'cgi')
    WHERE u2.id = p.comercial_id
      AND f.empresa_id = p.empresa_id
      AND f.status = 'ativo'
    LIMIT 1
  ) cgi ON true
  WHERE p.empresa_id = p_empresa_id
    AND p.status_emissao = 'emitido'
    AND p.modalidade NOT IN ('Contrato', 'Consorcio')
    AND p.data_emissao IS NOT NULL
    AND EXTRACT(MONTH FROM p.data_emissao) = p_mes
    AND EXTRACT(YEAR  FROM p.data_emissao) = p_ano
  ORDER BY p.data_emissao DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION analise_comissoes_mes(UUID, INTEGER, INTEGER) TO authenticated;
