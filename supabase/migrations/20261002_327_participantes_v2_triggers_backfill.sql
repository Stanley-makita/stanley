-- ============================================================
-- Migration 327: Participantes V2 — triggers de sincronização + backfill
-- Rodar SÓ depois de revisar o diagnóstico (supabase/*_diagnostico_participantes_v2.sql).
-- Triggers e backfill na mesma transação: nenhuma escrita escapa entre um e outro.
-- pg_trigger_depth() > 1: ignora UPDATEs feitos pelas próprias funções pv2_* e por
-- outros triggers (ex.: fn_sincronizar_pessoa_conjuge), evitando laço.
-- ============================================================
BEGIN;

CREATE OR REPLACE FUNCTION fn_pv2_leads() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_conj uuid;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NULL; END IF;
  IF TG_OP = 'UPDATE' AND NEW.pessoa_id IS NOT NULL THEN
    -- Renda editada no lead (tela antiga) → Pessoa (fonte nova).
    IF NEW.renda_formal IS DISTINCT FROM OLD.renda_formal OR NEW.renda_informal IS DISTINCT FROM OLD.renda_informal THEN
      UPDATE pessoas SET renda_formal = NEW.renda_formal, renda_informal = NEW.renda_informal
      WHERE id = NEW.pessoa_id
        AND (renda_formal IS DISTINCT FROM NEW.renda_formal OR renda_informal IS DISTINCT FROM NEW.renda_informal);
    END IF;
    IF NEW.conjuge_renda_formal IS DISTINCT FROM OLD.conjuge_renda_formal OR NEW.conjuge_renda_informal IS DISTINCT FROM OLD.conjuge_renda_informal THEN
      SELECT coalesce(NEW.conjuge_pessoa_id, conjuge_pessoa_id) INTO v_conj FROM pessoas WHERE id = NEW.pessoa_id;
      IF v_conj IS NOT NULL THEN
        UPDATE pessoas SET renda_formal = NEW.conjuge_renda_formal, renda_informal = NEW.conjuge_renda_informal
        WHERE id = v_conj
          AND (renda_formal IS DISTINCT FROM NEW.conjuge_renda_formal OR renda_informal IS DISTINCT FROM NEW.conjuge_renda_informal);
      END IF;
    END IF;
  END IF;
  PERFORM pv2_sincronizar_lead(NEW.id);
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_pv2_leads ON leads;
CREATE TRIGGER trg_pv2_leads AFTER INSERT OR UPDATE OF
  pessoa_id, conjuge_pessoa_id, conjuge_nome, conjuge_cpf, conjuge_data_nascimento,
  conjuge_renda_formal, conjuge_renda_informal, renda_formal, renda_informal, estado_civil, vendedor_pessoa_id
  ON leads FOR EACH ROW EXECUTE FUNCTION fn_pv2_leads();

CREATE OR REPLACE FUNCTION fn_pv2_lead_filhos() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NULL; END IF;
  PERFORM pv2_sincronizar_lead(CASE WHEN TG_OP = 'DELETE' THEN OLD.lead_id ELSE NEW.lead_id END);
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_pv2_lead_coparticipantes ON lead_coparticipantes;
CREATE TRIGGER trg_pv2_lead_coparticipantes AFTER INSERT OR UPDATE OR DELETE ON lead_coparticipantes
  FOR EACH ROW EXECUTE FUNCTION fn_pv2_lead_filhos();
DROP TRIGGER IF EXISTS trg_pv2_lead_vendedores ON lead_vendedores;
CREATE TRIGGER trg_pv2_lead_vendedores AFTER INSERT OR UPDATE OR DELETE ON lead_vendedores
  FOR EACH ROW EXECUTE FUNCTION fn_pv2_lead_filhos();

CREATE OR REPLACE FUNCTION fn_pv2_processo_filhos() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NULL; END IF;
  PERFORM pv2_sincronizar_processo(CASE WHEN TG_OP = 'DELETE' THEN OLD.processo_id ELSE NEW.processo_id END);
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_pv2_processo_compradores ON processo_compradores;
CREATE TRIGGER trg_pv2_processo_compradores AFTER INSERT OR UPDATE OR DELETE ON processo_compradores
  FOR EACH ROW EXECUTE FUNCTION fn_pv2_processo_filhos();
DROP TRIGGER IF EXISTS trg_pv2_processo_vendedores ON processo_vendedores;
CREATE TRIGGER trg_pv2_processo_vendedores AFTER INSERT OR UPDATE OR DELETE ON processo_vendedores
  FOR EACH ROW EXECUTE FUNCTION fn_pv2_processo_filhos();

CREATE OR REPLACE FUNCTION fn_pv2_pessoas() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NULL; END IF;
  -- Fim de casamento pela tela antiga: troca/remoção do cônjuge ou estado civil não-casado.
  IF OLD.conjuge_pessoa_id IS NOT NULL
     AND (NEW.conjuge_pessoa_id IS DISTINCT FROM OLD.conjuge_pessoa_id
          OR coalesce(NEW.estado_civil, '') NOT IN ('casado', 'uniao_estavel')) THEN
    UPDATE pessoa_relacionamentos SET data_fim = current_date
    WHERE data_fim IS NULL
      AND pessoa_a_id = least(NEW.id, OLD.conjuge_pessoa_id)
      AND pessoa_b_id = greatest(NEW.id, OLD.conjuge_pessoa_id);
  END IF;
  -- Edição explícita de regime/data pela tela antiga, com o mesmo cônjuge já vigente, tem
  -- que propagar pro relacionamento existente — pv2_garantir_relacionamento é fill-only e
  -- nunca sobrescreveria um regime_bens/data_inicio já preenchido.
  IF NEW.conjuge_pessoa_id IS NOT NULL AND NEW.conjuge_pessoa_id IS NOT DISTINCT FROM OLD.conjuge_pessoa_id
     AND (NEW.regime_casamento IS DISTINCT FROM OLD.regime_casamento OR NEW.data_casamento IS DISTINCT FROM OLD.data_casamento) THEN
    UPDATE pessoa_relacionamentos SET regime_bens = NEW.regime_casamento, data_inicio = NEW.data_casamento
    WHERE data_fim IS NULL
      AND pessoa_a_id = least(NEW.id, NEW.conjuge_pessoa_id)
      AND pessoa_b_id = greatest(NEW.id, NEW.conjuge_pessoa_id);
  END IF;
  PERFORM pv2_sincronizar_relacionamento_pessoa(NEW.id);
  FOR r IN SELECT id FROM leads WHERE pessoa_id = NEW.id AND deleted_at IS NULL LOOP
    PERFORM pv2_sincronizar_lead(r.id);
  END LOOP;
  FOR r IN SELECT DISTINCT processo_id FROM processo_compradores WHERE pessoa_id = NEW.id LOOP
    PERFORM pv2_sincronizar_processo(r.processo_id);
  END LOOP;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_pv2_pessoas ON pessoas;
CREATE TRIGGER trg_pv2_pessoas AFTER UPDATE OF
  conjuge_pessoa_id, estado_civil, regime_casamento, data_casamento, conjuge_nome, conjuge_cpf
  ON pessoas FOR EACH ROW EXECUTE FUNCTION fn_pv2_pessoas();

-- ── Backfill ────────────────────────────────────────────────────
-- Renda: Pessoa vence; Pessoa sem renda recebe a do lead mais recente.
UPDATE pessoas p
SET renda_formal   = coalesce(p.renda_formal, x.renda_formal),
    renda_informal = coalesce(p.renda_informal, x.renda_informal)
FROM (
  SELECT DISTINCT ON (pessoa_id) pessoa_id, renda_formal, renda_informal
  FROM leads WHERE deleted_at IS NULL AND pessoa_id IS NOT NULL
  ORDER BY pessoa_id, created_at DESC
) x
WHERE x.pessoa_id = p.id
  AND ((p.renda_formal IS NULL AND x.renda_formal IS NOT NULL) OR (p.renda_informal IS NULL AND x.renda_informal IS NOT NULL));

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM pessoas
           WHERE deleted_at IS NULL
             AND (conjuge_pessoa_id IS NOT NULL OR coalesce(trim(conjuge_nome), '') <> '' OR conjuge_cpf IS NOT NULL)
           ORDER BY created_at LOOP
    PERFORM pv2_sincronizar_relacionamento_pessoa(r.id);
  END LOOP;
  FOR r IN SELECT id FROM leads WHERE deleted_at IS NULL ORDER BY created_at LOOP
    PERFORM pv2_sincronizar_lead(r.id);
  END LOOP;
  FOR r IN SELECT id FROM processos WHERE deleted_at IS NULL ORDER BY created_at LOOP
    PERFORM pv2_sincronizar_processo(r.id);
  END LOOP;
END $$;

COMMIT;
