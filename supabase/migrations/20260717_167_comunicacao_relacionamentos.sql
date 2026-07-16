-- Central de Comunicação — Relacionamento de Comunicação (Entrega 1).
-- Interessado (Cliente/Corretor) → Relacionamento → identidade real por FK exclusiva,
-- nunca um ponteiro genérico nullable. Cada linha representa exatamente um interessado
-- num caso (Lead ou Negócio), com origem rastreável até a tabela de vínculo real.

CREATE TABLE IF NOT EXISTS comunicacao_relacionamentos (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id             UUID        NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  papel                  TEXT        NOT NULL CHECK (papel IN ('cliente', 'corretor')),

  -- Exatamente um par (contexto, identidade) preenchido por linha — ver constraint de forma abaixo.
  lead_id                UUID        REFERENCES leads(id) ON DELETE CASCADE,
  processo_id            UUID        REFERENCES processos(id) ON DELETE CASCADE,
  processo_comprador_id  UUID        REFERENCES processo_compradores(id) ON DELETE CASCADE,
  lead_corretor_id       UUID        REFERENCES lead_corretores(id) ON DELETE CASCADE,
  processo_corretor_id   UUID        REFERENCES processo_corretores(id) ON DELETE CASCADE,

  modo_relacionamento    TEXT        NOT NULL DEFAULT 'direto'
                            CHECK (modo_relacionamento IN ('direto', 'intermediado')),
  estado                 TEXT        NOT NULL DEFAULT 'ativo'
                            CHECK (estado IN ('ativo', 'suspenso', 'encerrado')),
  representado_por_id    UUID        REFERENCES comunicacao_relacionamentos(id) ON DELETE SET NULL,

  criado_em              TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em          TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Forma: cada papel/contexto usa exatamente sua FK de identidade; as outras três ficam NULL.
  -- Cliente-em-Captação não tem tabela de vínculo própria (o Lead É o cliente) — por isso usa
  -- lead_id como a própria identidade, não um ID de junção.
  CONSTRAINT chk_comunicacao_relacionamentos_forma CHECK (
    (papel = 'cliente' AND lead_id IS NOT NULL AND processo_id IS NULL
      AND processo_comprador_id IS NULL AND lead_corretor_id IS NULL AND processo_corretor_id IS NULL)
    OR (papel = 'cliente' AND processo_id IS NOT NULL AND lead_id IS NULL
      AND processo_comprador_id IS NOT NULL AND lead_corretor_id IS NULL AND processo_corretor_id IS NULL)
    OR (papel = 'corretor' AND lead_id IS NOT NULL AND processo_id IS NULL
      AND lead_corretor_id IS NOT NULL AND processo_comprador_id IS NULL AND processo_corretor_id IS NULL)
    OR (papel = 'corretor' AND processo_id IS NOT NULL AND lead_id IS NULL
      AND processo_corretor_id IS NOT NULL AND processo_comprador_id IS NULL AND lead_corretor_id IS NULL)
  ),

  CONSTRAINT chk_comunicacao_relacionamentos_modo_representante CHECK (
    (modo_relacionamento = 'direto' AND representado_por_id IS NULL)
    OR (modo_relacionamento = 'intermediado' AND representado_por_id IS NOT NULL)
  ),

  CONSTRAINT chk_comunicacao_relacionamentos_sem_autorrepresentacao
    CHECK (representado_por_id IS NULL OR representado_por_id <> id)
);

-- Unicidade real por identidade — quatro índices parciais, um por combinação papel/contexto.
-- Um UNIQUE composto sobre colunas nullable não bastaria (NULL != NULL não bloqueia duplicidade).
CREATE UNIQUE INDEX IF NOT EXISTS uq_comrel_cliente_lead
  ON comunicacao_relacionamentos(lead_id) WHERE papel = 'cliente' AND lead_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_comrel_cliente_comprador
  ON comunicacao_relacionamentos(processo_comprador_id) WHERE papel = 'cliente' AND processo_comprador_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_comrel_corretor_lead
  ON comunicacao_relacionamentos(lead_corretor_id) WHERE papel = 'corretor' AND lead_corretor_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_comrel_corretor_processo
  ON comunicacao_relacionamentos(processo_corretor_id) WHERE papel = 'corretor' AND processo_corretor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_comrel_empresa ON comunicacao_relacionamentos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_comrel_representado_por ON comunicacao_relacionamentos(representado_por_id) WHERE representado_por_id IS NOT NULL;

CREATE TRIGGER trg_comrel_atualizado_em
  BEFORE UPDATE ON comunicacao_relacionamentos
  FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

ALTER TABLE comunicacao_relacionamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comrel_select_empresa" ON comunicacao_relacionamentos
  FOR SELECT USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
  );

-- Sem policy de INSERT/UPDATE direta para o role authenticated: a criação é sempre via
-- trigger de materialização (abaixo) e a alteração é sempre via RPC SECURITY DEFINER
-- (migration seguinte) — nunca escrita direta do client.
CREATE POLICY "comrel_service_all" ON comunicacao_relacionamentos
  FOR ALL USING (auth.role() = 'service_role');


-- ── Validação cruzada: garante que a identidade referenciada realmente pertence ao
-- contexto (lead_id/processo_id) declarado na mesma linha. Uma FK simples não expressa
-- isso porque atravessa tabelas diferentes conforme papel/contexto. Roda em toda
-- escrita, inclusive as que não vêm dos triggers de materialização abaixo.
CREATE OR REPLACE FUNCTION fn_validar_comunicacao_relacionamento()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.papel = 'cliente' AND NEW.processo_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM processo_compradores
      WHERE id = NEW.processo_comprador_id AND processo_id = NEW.processo_id
    ) THEN
      RAISE EXCEPTION 'processo_comprador_id % nao pertence ao processo_id %', NEW.processo_comprador_id, NEW.processo_id;
    END IF;
  ELSIF NEW.papel = 'corretor' AND NEW.lead_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM lead_corretores
      WHERE id = NEW.lead_corretor_id AND lead_id = NEW.lead_id
    ) THEN
      RAISE EXCEPTION 'lead_corretor_id % nao pertence ao lead_id %', NEW.lead_corretor_id, NEW.lead_id;
    END IF;
  ELSIF NEW.papel = 'corretor' AND NEW.processo_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM processo_corretores
      WHERE id = NEW.processo_corretor_id AND processo_id = NEW.processo_id
    ) THEN
      RAISE EXCEPTION 'processo_corretor_id % nao pertence ao processo_id %', NEW.processo_corretor_id, NEW.processo_id;
    END IF;
  END IF;
  -- papel='cliente' AND lead_id IS NOT NULL: identidade É o próprio lead_id, nada a cruzar.
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_comrel_validar_vinculo
  BEFORE INSERT OR UPDATE ON comunicacao_relacionamentos
  FOR EACH ROW EXECUTE FUNCTION fn_validar_comunicacao_relacionamento();


-- ── Materialização automática: todo interessado nasce com relacionamento, sem janela
-- "ainda não existe" e sem depender de nenhuma tela ter sido aberta primeiro.

CREATE OR REPLACE FUNCTION fn_criar_comrel_cliente_lead()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO comunicacao_relacionamentos (empresa_id, papel, lead_id)
  VALUES (NEW.empresa_id, 'cliente', NEW.id);
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_comrel_criar_cliente_lead
  AFTER INSERT ON leads
  FOR EACH ROW EXECUTE FUNCTION fn_criar_comrel_cliente_lead();

CREATE OR REPLACE FUNCTION fn_criar_comrel_cliente_processo()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO comunicacao_relacionamentos (empresa_id, papel, processo_id, processo_comprador_id)
  VALUES (NEW.empresa_id, 'cliente', NEW.processo_id, NEW.id);
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_comrel_criar_cliente_processo
  AFTER INSERT ON processo_compradores
  FOR EACH ROW EXECUTE FUNCTION fn_criar_comrel_cliente_processo();

CREATE OR REPLACE FUNCTION fn_criar_comrel_corretor_lead()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_empresa_id UUID;
BEGIN
  SELECT empresa_id INTO v_empresa_id FROM leads WHERE id = NEW.lead_id;
  INSERT INTO comunicacao_relacionamentos (empresa_id, papel, lead_id, lead_corretor_id)
  VALUES (v_empresa_id, 'corretor', NEW.lead_id, NEW.id);
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_comrel_criar_corretor_lead
  AFTER INSERT ON lead_corretores
  FOR EACH ROW EXECUTE FUNCTION fn_criar_comrel_corretor_lead();

CREATE OR REPLACE FUNCTION fn_criar_comrel_corretor_processo()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_empresa_id UUID;
BEGIN
  SELECT empresa_id INTO v_empresa_id FROM processos WHERE id = NEW.processo_id;
  INSERT INTO comunicacao_relacionamentos (empresa_id, papel, processo_id, processo_corretor_id)
  VALUES (v_empresa_id, 'corretor', NEW.processo_id, NEW.id);
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_comrel_criar_corretor_processo
  AFTER INSERT ON processo_corretores
  FOR EACH ROW EXECUTE FUNCTION fn_criar_comrel_corretor_processo();


-- ── Backfill: linhas já existentes nas quatro origens ainda não têm relacionamento.
-- ON CONFLICT DO NOTHING protege contra reexecução acidental da migration.

INSERT INTO comunicacao_relacionamentos (empresa_id, papel, lead_id)
SELECT empresa_id, 'cliente', id FROM leads
ON CONFLICT DO NOTHING;

INSERT INTO comunicacao_relacionamentos (empresa_id, papel, processo_id, processo_comprador_id)
SELECT pc.empresa_id, 'cliente', pc.processo_id, pc.id
FROM processo_compradores pc
ON CONFLICT DO NOTHING;

INSERT INTO comunicacao_relacionamentos (empresa_id, papel, lead_id, lead_corretor_id)
SELECT l.empresa_id, 'corretor', lc.lead_id, lc.id
FROM lead_corretores lc
JOIN leads l ON l.id = lc.lead_id
ON CONFLICT DO NOTHING;

INSERT INTO comunicacao_relacionamentos (empresa_id, papel, processo_id, processo_corretor_id)
SELECT pr.empresa_id, 'corretor', prc.processo_id, prc.id
FROM processo_corretores prc
JOIN processos pr ON pr.id = prc.processo_id
ON CONFLICT DO NOTHING;
