-- Central de Comunicação — estende comunicacao_relacionamentos (migrations 167, 172) para
-- Parceiro e Imobiliária/Construtora no lado Processo (Negócio). Espelha exatamente a
-- migration 20260719_172 (que fez o mesmo pro lado Lead) — mesmo padrão, mesma disciplina.
--
-- Comprador e Corretor de Processo NÃO precisam de migration: os ramos `processo_id +
-- processo_comprador_id` (papel 'cliente') e `processo_id + processo_corretor_id` (papel
-- 'corretor') já existem desde a migration 167, com triggers de materialização automática
-- (fn_criar_comrel_cliente_processo, fn_criar_comrel_corretor_processo) — só nunca foram
-- usados pela aplicação porque a rota Fase 1 de Processos nunca leu/escreveu nessa tabela.
--
-- 'vendedora' (terceiro valor de processo_imobiliarias.papel, sem equivalente no Lead) fica
-- de fora de propósito -- mantém paridade exata com o que já está validado em Leads.

-- ── 1. Novas colunas de identidade ──
ALTER TABLE comunicacao_relacionamentos
  ADD COLUMN IF NOT EXISTS processo_parceiro_id    UUID REFERENCES processo_parceiros(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS processo_imobiliaria_id UUID REFERENCES processo_imobiliarias(id) ON DELETE CASCADE;

-- ── 2. chk_comunicacao_relacionamentos_forma — recriada com os 2 ramos novos e os 6
-- ramos existentes reforçados para também exigir as 2 colunas novas NULL ──
ALTER TABLE comunicacao_relacionamentos
  DROP CONSTRAINT IF EXISTS chk_comunicacao_relacionamentos_forma;

ALTER TABLE comunicacao_relacionamentos
  ADD CONSTRAINT chk_comunicacao_relacionamentos_forma CHECK (
    (papel = 'cliente' AND lead_id IS NOT NULL AND processo_id IS NULL
      AND processo_comprador_id IS NULL AND lead_corretor_id IS NULL AND processo_corretor_id IS NULL
      AND lead_parceiro_id IS NULL AND lead_imobiliaria_id IS NULL
      AND processo_parceiro_id IS NULL AND processo_imobiliaria_id IS NULL)
    OR (papel = 'cliente' AND processo_id IS NOT NULL AND lead_id IS NULL
      AND processo_comprador_id IS NOT NULL AND lead_corretor_id IS NULL AND processo_corretor_id IS NULL
      AND lead_parceiro_id IS NULL AND lead_imobiliaria_id IS NULL
      AND processo_parceiro_id IS NULL AND processo_imobiliaria_id IS NULL)
    OR (papel = 'corretor' AND lead_id IS NOT NULL AND processo_id IS NULL
      AND lead_corretor_id IS NOT NULL AND processo_comprador_id IS NULL AND processo_corretor_id IS NULL
      AND lead_parceiro_id IS NULL AND lead_imobiliaria_id IS NULL
      AND processo_parceiro_id IS NULL AND processo_imobiliaria_id IS NULL)
    OR (papel = 'corretor' AND processo_id IS NOT NULL AND lead_id IS NULL
      AND processo_corretor_id IS NOT NULL AND processo_comprador_id IS NULL AND lead_corretor_id IS NULL
      AND lead_parceiro_id IS NULL AND lead_imobiliaria_id IS NULL
      AND processo_parceiro_id IS NULL AND processo_imobiliaria_id IS NULL)
    OR (papel = 'parceiro' AND lead_id IS NOT NULL AND lead_parceiro_id IS NOT NULL
      AND processo_id IS NULL AND processo_comprador_id IS NULL AND lead_corretor_id IS NULL
      AND processo_corretor_id IS NULL AND lead_imobiliaria_id IS NULL
      AND processo_parceiro_id IS NULL AND processo_imobiliaria_id IS NULL)
    OR (papel IN ('imobiliaria', 'construtora') AND lead_id IS NOT NULL AND lead_imobiliaria_id IS NOT NULL
      AND processo_id IS NULL AND processo_comprador_id IS NULL AND lead_corretor_id IS NULL
      AND processo_corretor_id IS NULL AND lead_parceiro_id IS NULL
      AND processo_parceiro_id IS NULL AND processo_imobiliaria_id IS NULL)
    OR (papel = 'parceiro' AND processo_id IS NOT NULL AND processo_parceiro_id IS NOT NULL
      AND lead_id IS NULL AND processo_comprador_id IS NULL AND lead_corretor_id IS NULL
      AND processo_corretor_id IS NULL AND lead_parceiro_id IS NULL AND lead_imobiliaria_id IS NULL
      AND processo_imobiliaria_id IS NULL)
    OR (papel IN ('imobiliaria', 'construtora') AND processo_id IS NOT NULL AND processo_imobiliaria_id IS NOT NULL
      AND lead_id IS NULL AND processo_comprador_id IS NULL AND lead_corretor_id IS NULL
      AND processo_corretor_id IS NULL AND lead_parceiro_id IS NULL AND lead_imobiliaria_id IS NULL
      AND processo_parceiro_id IS NULL)
  );

-- ── 3. Índices únicos parciais novos ──
CREATE UNIQUE INDEX IF NOT EXISTS uq_comrel_parceiro_processo
  ON comunicacao_relacionamentos(processo_parceiro_id) WHERE papel = 'parceiro' AND processo_parceiro_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_comrel_imobiliaria_processo
  ON comunicacao_relacionamentos(processo_imobiliaria_id) WHERE papel IN ('imobiliaria', 'construtora') AND processo_imobiliaria_id IS NOT NULL;

-- ── 4. Validação cruzada — 2 ELSIF novos em fn_validar_comunicacao_relacionamento ──
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
  ELSIF NEW.papel = 'parceiro' AND NEW.lead_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM lead_parceiros
      WHERE id = NEW.lead_parceiro_id AND lead_id = NEW.lead_id
    ) THEN
      RAISE EXCEPTION 'lead_parceiro_id % nao pertence ao lead_id %', NEW.lead_parceiro_id, NEW.lead_id;
    END IF;
  ELSIF NEW.papel = 'parceiro' AND NEW.processo_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM processo_parceiros
      WHERE id = NEW.processo_parceiro_id AND processo_id = NEW.processo_id
    ) THEN
      RAISE EXCEPTION 'processo_parceiro_id % nao pertence ao processo_id %', NEW.processo_parceiro_id, NEW.processo_id;
    END IF;
  ELSIF NEW.papel IN ('imobiliaria', 'construtora') AND NEW.lead_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM lead_imobiliarias
      WHERE id = NEW.lead_imobiliaria_id AND lead_id = NEW.lead_id AND papel = NEW.papel
    ) THEN
      RAISE EXCEPTION 'lead_imobiliaria_id % nao pertence ao lead_id % com papel %', NEW.lead_imobiliaria_id, NEW.lead_id, NEW.papel;
    END IF;
  ELSIF NEW.papel IN ('imobiliaria', 'construtora') AND NEW.processo_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM processo_imobiliarias
      WHERE id = NEW.processo_imobiliaria_id AND processo_id = NEW.processo_id AND papel = NEW.papel
    ) THEN
      RAISE EXCEPTION 'processo_imobiliaria_id % nao pertence ao processo_id % com papel %', NEW.processo_imobiliaria_id, NEW.processo_id, NEW.papel;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ── 5. Materialização automática — Parceiro e Imobiliária/Construtora de Processo ──
-- Mesmo padrão de fn_criar_comrel_parceiro_lead/fn_criar_comrel_imobiliaria_lead (migration
-- 172). ON CONFLICT DO NOTHING protege contra corrida com um eventual insert de fallback
-- feito pela rota da aplicação.
CREATE OR REPLACE FUNCTION fn_criar_comrel_parceiro_processo()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_empresa_id UUID;
BEGIN
  SELECT empresa_id INTO v_empresa_id FROM processos WHERE id = NEW.processo_id;
  INSERT INTO comunicacao_relacionamentos (empresa_id, papel, processo_id, processo_parceiro_id)
  VALUES (v_empresa_id, 'parceiro', NEW.processo_id, NEW.id)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_comrel_criar_parceiro_processo ON processo_parceiros;
CREATE TRIGGER trg_comrel_criar_parceiro_processo
  AFTER INSERT ON processo_parceiros
  FOR EACH ROW EXECUTE FUNCTION fn_criar_comrel_parceiro_processo();

CREATE OR REPLACE FUNCTION fn_criar_comrel_imobiliaria_processo()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_empresa_id UUID;
BEGIN
  SELECT empresa_id INTO v_empresa_id FROM processos WHERE id = NEW.processo_id;
  INSERT INTO comunicacao_relacionamentos (empresa_id, papel, processo_id, processo_imobiliaria_id)
  VALUES (v_empresa_id, NEW.papel, NEW.processo_id, NEW.id)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_comrel_criar_imobiliaria_processo ON processo_imobiliarias;
CREATE TRIGGER trg_comrel_criar_imobiliaria_processo
  AFTER INSERT ON processo_imobiliarias
  FOR EACH ROW EXECUTE FUNCTION fn_criar_comrel_imobiliaria_processo();

-- ── 6. Backfill a partir das junções já existentes ──
-- 'vendedora' fica de fora de proposito -- so materializa papel IN ('imobiliaria','construtora').
INSERT INTO comunicacao_relacionamentos (empresa_id, papel, processo_id, processo_parceiro_id)
SELECT pr.empresa_id, 'parceiro', pp.processo_id, pp.id
FROM processo_parceiros pp
JOIN processos pr ON pr.id = pp.processo_id
ON CONFLICT DO NOTHING;

INSERT INTO comunicacao_relacionamentos (empresa_id, papel, processo_id, processo_imobiliaria_id)
SELECT pr.empresa_id, pi.papel, pi.processo_id, pi.id
FROM processo_imobiliarias pi
JOIN processos pr ON pr.id = pi.processo_id
WHERE pi.papel IN ('imobiliaria', 'construtora')
ON CONFLICT DO NOTHING;
