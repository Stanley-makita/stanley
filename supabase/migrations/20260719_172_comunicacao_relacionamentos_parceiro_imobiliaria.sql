-- Central de Comunicação — estende comunicacao_relacionamentos (migration 167) para
-- Parceiro, Imobiliária e Construtora. Vendedor fica de fora de propósito: os campos
-- leads.vendedor_nome/vendedor_telefone são escalares livres que podem ser reescritos
-- pra representar outra pessoa no mesmo Lead — um relacionamento estrutural baseado só
-- em lead_id faria o histórico de comunicação trocar de identidade silenciosamente.
-- Fica pra uma entrega futura com identidade estável (vendedor_pessoa_id).

-- ── 1. Materializa lead_parceiros faltante a partir do atalho leads.parceiro_id ──
-- Roda antes do backfill abaixo, pra lead_parceiros já ser a fonte canônica completa
-- quando o backfill de comunicacao_relacionamentos ler dela.
DO $$
DECLARE
  v_inseridos INT;
BEGIN
  INSERT INTO lead_parceiros (lead_id, parceiro_id)
  SELECT l.id, l.parceiro_id
  FROM leads l
  WHERE l.parceiro_id IS NOT NULL
  ON CONFLICT (lead_id, parceiro_id) DO NOTHING;

  GET DIAGNOSTICS v_inseridos = ROW_COUNT;
  RAISE NOTICE 'lead_parceiros: % linha(s) materializada(s) a partir de leads.parceiro_id', v_inseridos;
END $$;

-- ── 2. Novas colunas de identidade ──
ALTER TABLE comunicacao_relacionamentos
  ADD COLUMN IF NOT EXISTS lead_parceiro_id    UUID REFERENCES lead_parceiros(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS lead_imobiliaria_id UUID REFERENCES lead_imobiliarias(id) ON DELETE CASCADE;

-- ── 3. CHECK de papel — a constraint original (migration 167) é anônima; descobre o
-- nome real em tempo de execução em vez de arriscar um DROP CONSTRAINT que não acha
-- nada (o que deixaria a constraint antiga e a nova coexistindo, travadas em valores
-- diferentes).
DO $$
DECLARE
  v_conname TEXT;
BEGIN
  SELECT conname INTO v_conname
  FROM pg_constraint
  WHERE conrelid = 'public.comunicacao_relacionamentos'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%papel = ANY%'
  LIMIT 1;

  IF v_conname IS NOT NULL AND v_conname <> 'comunicacao_relacionamentos_papel_check' THEN
    EXECUTE format('ALTER TABLE comunicacao_relacionamentos DROP CONSTRAINT %I', v_conname);
  END IF;
END $$;

ALTER TABLE comunicacao_relacionamentos
  DROP CONSTRAINT IF EXISTS comunicacao_relacionamentos_papel_check;

-- Sem 'vendedor' de propósito -- ver nota no topo do arquivo.
ALTER TABLE comunicacao_relacionamentos
  ADD CONSTRAINT comunicacao_relacionamentos_papel_check
  CHECK (papel IN ('cliente', 'corretor', 'parceiro', 'imobiliaria', 'construtora'));

-- ── 4. chk_comunicacao_relacionamentos_forma — recriada com os 2 ramos novos ──
ALTER TABLE comunicacao_relacionamentos
  DROP CONSTRAINT IF EXISTS chk_comunicacao_relacionamentos_forma;

ALTER TABLE comunicacao_relacionamentos
  ADD CONSTRAINT chk_comunicacao_relacionamentos_forma CHECK (
    (papel = 'cliente' AND lead_id IS NOT NULL AND processo_id IS NULL
      AND processo_comprador_id IS NULL AND lead_corretor_id IS NULL AND processo_corretor_id IS NULL
      AND lead_parceiro_id IS NULL AND lead_imobiliaria_id IS NULL)
    OR (papel = 'cliente' AND processo_id IS NOT NULL AND lead_id IS NULL
      AND processo_comprador_id IS NOT NULL AND lead_corretor_id IS NULL AND processo_corretor_id IS NULL
      AND lead_parceiro_id IS NULL AND lead_imobiliaria_id IS NULL)
    OR (papel = 'corretor' AND lead_id IS NOT NULL AND processo_id IS NULL
      AND lead_corretor_id IS NOT NULL AND processo_comprador_id IS NULL AND processo_corretor_id IS NULL
      AND lead_parceiro_id IS NULL AND lead_imobiliaria_id IS NULL)
    OR (papel = 'corretor' AND processo_id IS NOT NULL AND lead_id IS NULL
      AND processo_corretor_id IS NOT NULL AND processo_comprador_id IS NULL AND lead_corretor_id IS NULL
      AND lead_parceiro_id IS NULL AND lead_imobiliaria_id IS NULL)
    OR (papel = 'parceiro' AND lead_id IS NOT NULL AND lead_parceiro_id IS NOT NULL
      AND processo_id IS NULL AND processo_comprador_id IS NULL AND lead_corretor_id IS NULL
      AND processo_corretor_id IS NULL AND lead_imobiliaria_id IS NULL)
    OR (papel IN ('imobiliaria', 'construtora') AND lead_id IS NOT NULL AND lead_imobiliaria_id IS NOT NULL
      AND processo_id IS NULL AND processo_comprador_id IS NULL AND lead_corretor_id IS NULL
      AND processo_corretor_id IS NULL AND lead_parceiro_id IS NULL)
  );

-- ── 5. Índices únicos parciais novos ──
CREATE UNIQUE INDEX IF NOT EXISTS uq_comrel_parceiro_lead
  ON comunicacao_relacionamentos(lead_parceiro_id) WHERE papel = 'parceiro' AND lead_parceiro_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_comrel_imobiliaria_lead
  ON comunicacao_relacionamentos(lead_imobiliaria_id) WHERE papel IN ('imobiliaria', 'construtora') AND lead_imobiliaria_id IS NOT NULL;

-- ── 6. Validação cruzada — 2 ramos novos em fn_validar_comunicacao_relacionamento ──
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
  ELSIF NEW.papel = 'parceiro' THEN
    IF NOT EXISTS (
      SELECT 1 FROM lead_parceiros
      WHERE id = NEW.lead_parceiro_id AND lead_id = NEW.lead_id
    ) THEN
      RAISE EXCEPTION 'lead_parceiro_id % nao pertence ao lead_id %', NEW.lead_parceiro_id, NEW.lead_id;
    END IF;
  ELSIF NEW.papel IN ('imobiliaria', 'construtora') THEN
    IF NOT EXISTS (
      SELECT 1 FROM lead_imobiliarias
      WHERE id = NEW.lead_imobiliaria_id AND lead_id = NEW.lead_id AND papel = NEW.papel
    ) THEN
      RAISE EXCEPTION 'lead_imobiliaria_id % nao pertence ao lead_id % com papel %', NEW.lead_imobiliaria_id, NEW.lead_id, NEW.papel;
    END IF;
  END IF;
  -- papel='cliente' AND lead_id IS NOT NULL: identidade É o próprio lead_id, nada a cruzar.
  RETURN NEW;
END;
$$;

-- ── 7. Materialização automática — só Parceiro e Imobiliária/Construtora ──
-- Mesmo padrão de fn_criar_comrel_corretor_lead/trg_comrel_criar_corretor_lead (migration
-- 167). ON CONFLICT DO NOTHING protege contra corrida com um eventual insert de fallback
-- feito pela rota da aplicação (mesmo racional dos índices únicos parciais do passo 5).
CREATE OR REPLACE FUNCTION fn_criar_comrel_parceiro_lead()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_empresa_id UUID;
BEGIN
  SELECT empresa_id INTO v_empresa_id FROM leads WHERE id = NEW.lead_id;
  INSERT INTO comunicacao_relacionamentos (empresa_id, papel, lead_id, lead_parceiro_id)
  VALUES (v_empresa_id, 'parceiro', NEW.lead_id, NEW.id)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_comrel_criar_parceiro_lead ON lead_parceiros;
CREATE TRIGGER trg_comrel_criar_parceiro_lead
  AFTER INSERT ON lead_parceiros
  FOR EACH ROW EXECUTE FUNCTION fn_criar_comrel_parceiro_lead();

CREATE OR REPLACE FUNCTION fn_criar_comrel_imobiliaria_lead()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_empresa_id UUID;
BEGIN
  SELECT empresa_id INTO v_empresa_id FROM leads WHERE id = NEW.lead_id;
  INSERT INTO comunicacao_relacionamentos (empresa_id, papel, lead_id, lead_imobiliaria_id)
  VALUES (v_empresa_id, NEW.papel, NEW.lead_id, NEW.id)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_comrel_criar_imobiliaria_lead ON lead_imobiliarias;
CREATE TRIGGER trg_comrel_criar_imobiliaria_lead
  AFTER INSERT ON lead_imobiliarias
  FOR EACH ROW EXECUTE FUNCTION fn_criar_comrel_imobiliaria_lead();

-- ── 8. Backfill de comunicacao_relacionamentos a partir das junções já existentes ──
-- Roda depois do passo 1, então já cobre os leads que só tinham o atalho parceiro_id.
INSERT INTO comunicacao_relacionamentos (empresa_id, papel, lead_id, lead_parceiro_id)
SELECT l.empresa_id, 'parceiro', lp.lead_id, lp.id
FROM lead_parceiros lp
JOIN leads l ON l.id = lp.lead_id
ON CONFLICT DO NOTHING;

INSERT INTO comunicacao_relacionamentos (empresa_id, papel, lead_id, lead_imobiliaria_id)
SELECT l.empresa_id, li.papel, li.lead_id, li.id
FROM lead_imobiliarias li
JOIN leads l ON l.id = li.lead_id
ON CONFLICT DO NOTHING;
