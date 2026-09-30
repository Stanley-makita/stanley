-- ============================================================
-- Migration 330: Participantes V2 — B2a: comunicação com comprador por participação
-- comunicacao_relacionamentos (cliente em Negócio) era identificado por processo_compradores.id.
-- Passa a ter participacao_id (participação de compra: titular/coparticipante/cônjuge anuente).
-- Linhas existentes ganham participacao_id (mesma Pessoa no mesmo processo) e mantêm
-- processo_comprador_id até a B3. ATENÇÃO B3: processo_comprador_id é ON DELETE CASCADE —
-- zerar antes de apagar processo_compradores, senão o histórico de comunicação some junto.
-- ============================================================
BEGIN;

ALTER TABLE comunicacao_relacionamentos
  ADD COLUMN IF NOT EXISTS participacao_id UUID REFERENCES participacoes(id) ON DELETE CASCADE;

-- Mesma forma da migration 173; cliente em Negócio aceita processo_comprador_id OU participacao_id,
-- e todas as outras formas exigem participacao_id nulo.
ALTER TABLE comunicacao_relacionamentos DROP CONSTRAINT IF EXISTS chk_comunicacao_relacionamentos_forma;
ALTER TABLE comunicacao_relacionamentos
  ADD CONSTRAINT chk_comunicacao_relacionamentos_forma CHECK (
    (papel = 'cliente' AND lead_id IS NOT NULL AND processo_id IS NULL
      AND processo_comprador_id IS NULL AND participacao_id IS NULL AND lead_corretor_id IS NULL AND processo_corretor_id IS NULL
      AND lead_parceiro_id IS NULL AND lead_imobiliaria_id IS NULL
      AND processo_parceiro_id IS NULL AND processo_imobiliaria_id IS NULL)
    OR (papel = 'cliente' AND processo_id IS NOT NULL AND lead_id IS NULL
      AND (processo_comprador_id IS NOT NULL OR participacao_id IS NOT NULL)
      AND lead_corretor_id IS NULL AND processo_corretor_id IS NULL
      AND lead_parceiro_id IS NULL AND lead_imobiliaria_id IS NULL
      AND processo_parceiro_id IS NULL AND processo_imobiliaria_id IS NULL)
    OR (papel = 'corretor' AND lead_id IS NOT NULL AND processo_id IS NULL
      AND lead_corretor_id IS NOT NULL AND processo_comprador_id IS NULL AND participacao_id IS NULL AND processo_corretor_id IS NULL
      AND lead_parceiro_id IS NULL AND lead_imobiliaria_id IS NULL
      AND processo_parceiro_id IS NULL AND processo_imobiliaria_id IS NULL)
    OR (papel = 'corretor' AND processo_id IS NOT NULL AND lead_id IS NULL
      AND processo_corretor_id IS NOT NULL AND processo_comprador_id IS NULL AND participacao_id IS NULL AND lead_corretor_id IS NULL
      AND lead_parceiro_id IS NULL AND lead_imobiliaria_id IS NULL
      AND processo_parceiro_id IS NULL AND processo_imobiliaria_id IS NULL)
    OR (papel = 'parceiro' AND lead_id IS NOT NULL AND lead_parceiro_id IS NOT NULL
      AND processo_id IS NULL AND processo_comprador_id IS NULL AND participacao_id IS NULL AND lead_corretor_id IS NULL
      AND processo_corretor_id IS NULL AND lead_imobiliaria_id IS NULL
      AND processo_parceiro_id IS NULL AND processo_imobiliaria_id IS NULL)
    OR (papel IN ('imobiliaria', 'construtora') AND lead_id IS NOT NULL AND lead_imobiliaria_id IS NOT NULL
      AND processo_id IS NULL AND processo_comprador_id IS NULL AND participacao_id IS NULL AND lead_corretor_id IS NULL
      AND processo_corretor_id IS NULL AND lead_parceiro_id IS NULL
      AND processo_parceiro_id IS NULL AND processo_imobiliaria_id IS NULL)
    OR (papel = 'parceiro' AND processo_id IS NOT NULL AND processo_parceiro_id IS NOT NULL
      AND lead_id IS NULL AND processo_comprador_id IS NULL AND participacao_id IS NULL AND lead_corretor_id IS NULL
      AND processo_corretor_id IS NULL AND lead_parceiro_id IS NULL AND lead_imobiliaria_id IS NULL
      AND processo_imobiliaria_id IS NULL)
    OR (papel IN ('imobiliaria', 'construtora') AND processo_id IS NOT NULL AND processo_imobiliaria_id IS NOT NULL
      AND lead_id IS NULL AND processo_comprador_id IS NULL AND participacao_id IS NULL AND lead_corretor_id IS NULL
      AND processo_corretor_id IS NULL AND lead_parceiro_id IS NULL AND lead_imobiliaria_id IS NULL
      AND processo_parceiro_id IS NULL)
  );

CREATE UNIQUE INDEX IF NOT EXISTS uq_comrel_cliente_participacao
  ON comunicacao_relacionamentos(participacao_id) WHERE papel = 'cliente' AND participacao_id IS NOT NULL;

-- Validação: participacao_id tem que ser participação de COMPRA do mesmo processo.
-- Resto: cópia literal de fn_validar_comunicacao_relacionamento (migration 173).
CREATE OR REPLACE FUNCTION fn_validar_comunicacao_relacionamento()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.papel = 'cliente' AND NEW.processo_id IS NOT NULL THEN
    IF NEW.participacao_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM participacoes
        WHERE id = NEW.participacao_id AND processo_id = NEW.processo_id
          AND papel IN ('titular', 'coparticipante', 'conjuge_anuente')
      ) THEN
        RAISE EXCEPTION 'participacao_id % nao e participacao de compra do processo_id %', NEW.participacao_id, NEW.processo_id;
      END IF;
    END IF;
    IF NEW.processo_comprador_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM processo_compradores
        WHERE id = NEW.processo_comprador_id AND processo_id = NEW.processo_id
      ) THEN
        RAISE EXCEPTION 'processo_comprador_id % nao pertence ao processo_id %', NEW.processo_comprador_id, NEW.processo_id;
      END IF;
    END IF;
  ELSIF NEW.papel = 'corretor' AND NEW.lead_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM lead_corretores WHERE id = NEW.lead_corretor_id AND lead_id = NEW.lead_id) THEN
      RAISE EXCEPTION 'lead_corretor_id % nao pertence ao lead_id %', NEW.lead_corretor_id, NEW.lead_id;
    END IF;
  ELSIF NEW.papel = 'corretor' AND NEW.processo_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM processo_corretores WHERE id = NEW.processo_corretor_id AND processo_id = NEW.processo_id) THEN
      RAISE EXCEPTION 'processo_corretor_id % nao pertence ao processo_id %', NEW.processo_corretor_id, NEW.processo_id;
    END IF;
  ELSIF NEW.papel = 'parceiro' AND NEW.lead_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM lead_parceiros WHERE id = NEW.lead_parceiro_id AND lead_id = NEW.lead_id) THEN
      RAISE EXCEPTION 'lead_parceiro_id % nao pertence ao lead_id %', NEW.lead_parceiro_id, NEW.lead_id;
    END IF;
  ELSIF NEW.papel = 'parceiro' AND NEW.processo_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM processo_parceiros WHERE id = NEW.processo_parceiro_id AND processo_id = NEW.processo_id) THEN
      RAISE EXCEPTION 'processo_parceiro_id % nao pertence ao processo_id %', NEW.processo_parceiro_id, NEW.processo_id;
    END IF;
  ELSIF NEW.papel IN ('imobiliaria', 'construtora') AND NEW.lead_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM lead_imobiliarias WHERE id = NEW.lead_imobiliaria_id AND lead_id = NEW.lead_id AND papel = NEW.papel) THEN
      RAISE EXCEPTION 'lead_imobiliaria_id % nao pertence ao lead_id % com papel %', NEW.lead_imobiliaria_id, NEW.lead_id, NEW.papel;
    END IF;
  ELSIF NEW.papel IN ('imobiliaria', 'construtora') AND NEW.processo_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM processo_imobiliarias WHERE id = NEW.processo_imobiliaria_id AND processo_id = NEW.processo_id AND papel = NEW.papel) THEN
      RAISE EXCEPTION 'processo_imobiliaria_id % nao pertence ao processo_id % com papel %', NEW.processo_imobiliaria_id, NEW.processo_id, NEW.papel;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Relacionamento de comunicação nasce com a participação de compra (como nascia com processo_compradores).
CREATE OR REPLACE FUNCTION fn_criar_comrel_participacao() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.processo_id IS NOT NULL AND NEW.papel IN ('titular', 'coparticipante', 'conjuge_anuente') THEN
    INSERT INTO comunicacao_relacionamentos (empresa_id, papel, processo_id, participacao_id)
    VALUES (NEW.empresa_id, 'cliente', NEW.processo_id, NEW.id)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_comrel_criar_participacao ON participacoes;
CREATE TRIGGER trg_comrel_criar_participacao
  AFTER INSERT OR UPDATE OF papel ON participacoes
  FOR EACH ROW EXECUTE FUNCTION fn_criar_comrel_participacao();

-- Backfill 1: linhas existentes (por processo_compradores) ganham a participação da mesma Pessoa.
-- DISTINCT ON: duas linhas antigas da mesma Pessoa no mesmo processo → só a mais antiga recebe.
WITH alvo AS (
  SELECT DISTINCT ON (pa.id) cr.id AS comrel_id, pa.id AS participacao_id
  FROM comunicacao_relacionamentos cr
  JOIN processo_compradores pc ON pc.id = cr.processo_comprador_id
  JOIN participacoes pa ON pa.processo_id = pc.processo_id AND pa.pessoa_id = pc.pessoa_id
   AND pa.papel IN ('titular', 'coparticipante', 'conjuge_anuente')
  WHERE cr.papel = 'cliente' AND cr.participacao_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM comunicacao_relacionamentos x WHERE x.participacao_id = pa.id)
  ORDER BY pa.id, cr.criado_em
)
UPDATE comunicacao_relacionamentos cr SET participacao_id = alvo.participacao_id
FROM alvo WHERE cr.id = alvo.comrel_id;

-- Backfill 2: participação de compra sem relacionamento (ex.: cônjuge anuente, que nunca esteve em processo_compradores).
INSERT INTO comunicacao_relacionamentos (empresa_id, papel, processo_id, participacao_id)
SELECT pa.empresa_id, 'cliente', pa.processo_id, pa.id
FROM participacoes pa
WHERE pa.processo_id IS NOT NULL AND pa.papel IN ('titular', 'coparticipante', 'conjuge_anuente')
ON CONFLICT DO NOTHING;

COMMIT;
