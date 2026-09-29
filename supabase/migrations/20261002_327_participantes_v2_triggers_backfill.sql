-- ============================================================
-- Migration 327: Participantes V2 — triggers de sincronização + backfill
-- Rodar SÓ depois de revisar o diagnóstico (supabase/*_diagnostico_participantes_v2.sql).
-- Triggers e backfill na mesma transação: nenhuma escrita escapa entre um e outro.
-- pg_trigger_depth() > 1: ignora UPDATEs feitos pelas próprias funções pv2_* e por
-- outros triggers (ex.: fn_sincronizar_pessoa_conjuge), evitando laço.
--
-- Flag pv2.backfill (fix round 2): o backfill abaixo chama pv2_sincronizar_lead/_processo/
-- _relacionamento_pessoa DIRETO de um DO block de topo (profundidade de trigger 0), não de
-- dentro de um trigger de aplicação. Quando essas funções escrevem pessoas.conjuge_pessoa_id
-- (fill de ponteiro vazio), esse UPDATE dispara trg_pv2_pessoas em profundidade 1 — igual a uma
-- edição real da tela antiga — e o bloco de "vínculo explícito" (fix round 1) então ENCERRA
-- qualquer OUTRO relacionamento vigente dessa pessoa, achando que é um recasamento de verdade.
-- Isso pode apagar um relacionamento vigente REAL só porque o backfill preencheu um ponteiro
-- unilateral em outra pessoa do mesmo casal. Como o backfill já varre pessoas/leads/processos
-- explicitamente (loops abaixo), os 4 triggers são desligados por toda a duração do backfill via
-- `set_config('pv2.backfill', 'on', true)` (true = local à transação) e cada função de trigger
-- checa essa flag logo no início, ao lado do guard de profundidade.
--
-- OPERACIONAL: rodar fora do horário comercial. O CREATE TRIGGER trava leads, pessoas,
-- lead_coparticipantes, lead_vendedores, processo_compradores e processo_vendedores pelo
-- resto da transação (até o COMMIT no fim do arquivo); e o backfill sobe updated_at de
-- pessoas/leads/processos em massa, o que reseta formulários abertos na tela (AbaPessoa e
-- afins recarregam a entidade quando a referência muda — ver regra "Formulário de edição
-- não pode resetar por refetch em segundo plano" no CLAUDE.md do projeto).
-- ============================================================
BEGIN;

CREATE OR REPLACE FUNCTION fn_pv2_leads() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_conj uuid; v_estado text;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NULL; END IF;
  IF current_setting('pv2.backfill', true) = 'on' THEN RETURN NULL; END IF;
  IF TG_OP = 'INSERT' AND NEW.pessoa_id IS NOT NULL THEN
    -- Renda no INSERT: só preenche o que a Pessoa ainda não tiver (Pessoa é a fonte de verdade;
    -- nunca sobrescreve um valor que ela já tinha antes deste lead existir).
    UPDATE pessoas SET
      renda_formal   = coalesce(renda_formal, NEW.renda_formal),
      renda_informal = coalesce(renda_informal, NEW.renda_informal)
    WHERE id = NEW.pessoa_id
      AND ((renda_formal IS NULL AND NEW.renda_formal IS NOT NULL) OR (renda_informal IS NULL AND NEW.renda_informal IS NOT NULL));
  ELSIF TG_OP = 'UPDATE' AND NEW.pessoa_id IS NOT NULL THEN
    -- Renda editada no lead (tela antiga) → Pessoa (fonte nova). Coluna a coluna: não sobrescreve
    -- o campo irmão que não mudou (ex.: renda_informal gravada direto na Pessoa por outro caminho).
    IF NEW.renda_formal IS DISTINCT FROM OLD.renda_formal OR NEW.renda_informal IS DISTINCT FROM OLD.renda_informal THEN
      UPDATE pessoas SET
        renda_formal   = CASE WHEN NEW.renda_formal   IS DISTINCT FROM OLD.renda_formal   THEN NEW.renda_formal   ELSE renda_formal   END,
        renda_informal = CASE WHEN NEW.renda_informal IS DISTINCT FROM OLD.renda_informal THEN NEW.renda_informal ELSE renda_informal END
      WHERE id = NEW.pessoa_id
        AND ((NEW.renda_formal   IS DISTINCT FROM OLD.renda_formal   AND renda_formal   IS DISTINCT FROM NEW.renda_formal)
          OR (NEW.renda_informal IS DISTINCT FROM OLD.renda_informal AND renda_informal IS DISTINCT FROM NEW.renda_informal));
    END IF;
    IF NEW.conjuge_renda_formal IS DISTINCT FROM OLD.conjuge_renda_formal OR NEW.conjuge_renda_informal IS DISTINCT FROM OLD.conjuge_renda_informal THEN
      -- Cônjuge-alvo como na sync: ponteiro da Pessoa titular primeiro (só se ela estiver
      -- casada/em união estável); senão o ponteiro do lead, mas nunca se o par já foi encerrado.
      v_conj := NULL;
      SELECT conjuge_pessoa_id, estado_civil INTO v_conj, v_estado FROM pessoas WHERE id = NEW.pessoa_id AND deleted_at IS NULL;
      IF v_conj IS NULL OR coalesce(v_estado, '') NOT IN ('casado', 'uniao_estavel') THEN
        v_conj := NULL;
      END IF;
      -- Só descarta o ponteiro do lead como alvo quando o par está de fato ENCERRADO e não há
      -- uma linha VIGENTE pro mesmo par (senão já recasaram, não é ex).
      IF v_conj IS NULL AND NEW.conjuge_pessoa_id IS NOT NULL AND NOT (
        EXISTS (SELECT 1 FROM pessoa_relacionamentos WHERE data_fim IS NOT NULL AND pessoa_a_id = least(NEW.pessoa_id, NEW.conjuge_pessoa_id) AND pessoa_b_id = greatest(NEW.pessoa_id, NEW.conjuge_pessoa_id))
        AND NOT EXISTS (SELECT 1 FROM pessoa_relacionamentos WHERE data_fim IS NULL AND pessoa_a_id = least(NEW.pessoa_id, NEW.conjuge_pessoa_id) AND pessoa_b_id = greatest(NEW.pessoa_id, NEW.conjuge_pessoa_id))
      ) THEN
        v_conj := NEW.conjuge_pessoa_id;
      END IF;
      IF v_conj IS NOT NULL THEN
        UPDATE pessoas SET
          renda_formal   = CASE WHEN NEW.conjuge_renda_formal   IS DISTINCT FROM OLD.conjuge_renda_formal   THEN NEW.conjuge_renda_formal   ELSE renda_formal   END,
          renda_informal = CASE WHEN NEW.conjuge_renda_informal IS DISTINCT FROM OLD.conjuge_renda_informal THEN NEW.conjuge_renda_informal ELSE renda_informal END
        WHERE id = v_conj
          AND ((NEW.conjuge_renda_formal   IS DISTINCT FROM OLD.conjuge_renda_formal   AND renda_formal   IS DISTINCT FROM NEW.conjuge_renda_formal)
            OR (NEW.conjuge_renda_informal IS DISTINCT FROM OLD.conjuge_renda_informal AND renda_informal IS DISTINCT FROM NEW.conjuge_renda_informal));
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
  IF current_setting('pv2.backfill', true) = 'on' THEN RETURN NULL; END IF;
  IF TG_OP = 'DELETE' THEN
    PERFORM pv2_sincronizar_lead(OLD.lead_id);
  ELSE
    PERFORM pv2_sincronizar_lead(NEW.lead_id);
    IF TG_OP = 'UPDATE' AND OLD.lead_id IS DISTINCT FROM NEW.lead_id THEN
      PERFORM pv2_sincronizar_lead(OLD.lead_id);
    END IF;
  END IF;
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
  IF current_setting('pv2.backfill', true) = 'on' THEN RETURN NULL; END IF;
  IF TG_OP = 'DELETE' THEN
    PERFORM pv2_sincronizar_processo(OLD.processo_id);
  ELSE
    PERFORM pv2_sincronizar_processo(NEW.processo_id);
    IF TG_OP = 'UPDATE' AND OLD.processo_id IS DISTINCT FROM NEW.processo_id THEN
      PERFORM pv2_sincronizar_processo(OLD.processo_id);
    END IF;
  END IF;
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
  IF current_setting('pv2.backfill', true) = 'on' THEN RETURN NULL; END IF;

  -- Fim de casamento pela tela antiga: troca/remoção do cônjuge ou estado civil não-casado.
  -- Relacionamento encerrado NUNCA é recriado implicitamente (só por vínculo explícito, abaixo).
  IF OLD.conjuge_pessoa_id IS NOT NULL
     AND (NEW.conjuge_pessoa_id IS DISTINCT FROM OLD.conjuge_pessoa_id
          OR coalesce(NEW.estado_civil, '') NOT IN ('casado', 'uniao_estavel')) THEN
    UPDATE pessoa_relacionamentos SET data_fim = current_date
    WHERE data_fim IS NULL
      AND pessoa_a_id = least(NEW.id, OLD.conjuge_pessoa_id)
      AND pessoa_b_id = greatest(NEW.id, OLD.conjuge_pessoa_id);
    -- O ex-cônjuge pode ter ficado com participação/estado desatualizado (era cônjuge anuente em
    -- leads/processos deste titular, ou é titular de outro lead/processo próprio) — resincroniza.
    FOR r IN SELECT id FROM leads WHERE deleted_at IS NULL
             AND (pessoa_id = OLD.conjuge_pessoa_id OR conjuge_pessoa_id = OLD.conjuge_pessoa_id) LOOP
      PERFORM pv2_sincronizar_lead(r.id);
    END LOOP;
    FOR r IN SELECT DISTINCT processo_id FROM processo_compradores WHERE pessoa_id = OLD.conjuge_pessoa_id LOOP
      PERFORM pv2_sincronizar_processo(r.processo_id);
    END LOOP;
  END IF;

  -- Vínculo explícito (tela antiga aponta pra um cônjuge novo/diferente): só isso recria um
  -- relacionamento encerrado — pv2_garantir_relacionamento(..., true) ignora o histórico de fim.
  IF NEW.conjuge_pessoa_id IS NOT NULL AND NEW.conjuge_pessoa_id IS DISTINCT FROM OLD.conjuge_pessoa_id
     AND coalesce(NEW.estado_civil, '') IN ('casado', 'uniao_estavel') THEN
    UPDATE pessoa_relacionamentos SET data_fim = current_date
    WHERE data_fim IS NULL
      AND NEW.id IN (pessoa_a_id, pessoa_b_id)
      AND (CASE WHEN pessoa_a_id = NEW.id THEN pessoa_b_id ELSE pessoa_a_id END) IS DISTINCT FROM NEW.conjuge_pessoa_id;
    PERFORM pv2_garantir_relacionamento(NEW.empresa_id, NEW.id, NEW.conjuge_pessoa_id,
      CASE WHEN NEW.estado_civil = 'uniao_estavel' THEN 'uniao_estavel' ELSE 'casamento' END,
      NEW.regime_casamento, NEW.data_casamento, true);
  END IF;

  -- Edição explícita de regime/data/estado_civil pela tela antiga, com o mesmo cônjuge já vigente,
  -- tem que propagar pro relacionamento existente — pv2_garantir_relacionamento é fill-only e
  -- nunca sobrescreveria um regime_bens/data_inicio já preenchido. Atualiza só o(s) campo(s) que
  -- mudou(aram), sem apagar o irmão que ficou igual.
  IF NEW.conjuge_pessoa_id IS NOT NULL AND NEW.conjuge_pessoa_id IS NOT DISTINCT FROM OLD.conjuge_pessoa_id
     AND (NEW.regime_casamento IS DISTINCT FROM OLD.regime_casamento
       OR NEW.data_casamento IS DISTINCT FROM OLD.data_casamento
       OR NEW.estado_civil IS DISTINCT FROM OLD.estado_civil) THEN
    UPDATE pessoa_relacionamentos SET
      regime_bens = CASE WHEN NEW.regime_casamento IS DISTINCT FROM OLD.regime_casamento THEN NEW.regime_casamento ELSE regime_bens END,
      data_inicio = CASE WHEN NEW.data_casamento   IS DISTINCT FROM OLD.data_casamento   THEN NEW.data_casamento   ELSE data_inicio END,
      tipo = CASE WHEN NEW.estado_civil IS DISTINCT FROM OLD.estado_civil
                   AND NEW.estado_civil IN ('casado', 'uniao_estavel') AND OLD.estado_civil IN ('casado', 'uniao_estavel')
                  THEN (CASE WHEN NEW.estado_civil = 'uniao_estavel' THEN 'uniao_estavel' ELSE 'casamento' END)
                  ELSE tipo END
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
  -- compoe_renda de quem é cônjuge desta Pessoa precisa refletir a renda atual dela: resincroniza
  -- também os leads onde NEW.id é o cônjuge (via ponteiro do lead ou via ponteiro da Pessoa
  -- titular). Processos: já coberto acima quando NEW.id é o próprio comprador cônjuge.
  FOR r IN SELECT id FROM leads WHERE deleted_at IS NULL
           AND (conjuge_pessoa_id = NEW.id
             OR pessoa_id IN (SELECT id FROM pessoas WHERE conjuge_pessoa_id = NEW.id AND deleted_at IS NULL)) LOOP
    PERFORM pv2_sincronizar_lead(r.id);
  END LOOP;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_pv2_pessoas ON pessoas;
CREATE TRIGGER trg_pv2_pessoas AFTER UPDATE OF
  conjuge_pessoa_id, estado_civil, regime_casamento, data_casamento, conjuge_nome, conjuge_cpf,
  renda_formal, renda_informal
  ON pessoas FOR EACH ROW EXECUTE FUNCTION fn_pv2_pessoas();

-- ── Backfill ────────────────────────────────────────────────────
-- Desliga os 4 triggers pv2_* (ver comentário no topo do arquivo) pela duração do backfill —
-- 'on'/'off' local à transação (3º arg `true` de set_config), então nunca vaza pra fora dela.
SELECT set_config('pv2.backfill', 'on', true);

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

SELECT set_config('pv2.backfill', 'off', true);

COMMIT;
