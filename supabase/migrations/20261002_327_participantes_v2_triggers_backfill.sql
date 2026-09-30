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
-- 2ª passada de leads/processos (fix round 3): com os triggers desligados, um ponteiro
-- preenchido no MEIO do backfill (pv2_sincronizar_lead escrevendo pessoas.conjuge_pessoa_id,
-- ou o vendedor de pv2_sincronizar_processo) não propaga mais sozinho pros leads/processos que
-- já tinham sido sincronizados ANTES nas mesmas passadas — o fill acontece na hora, mas nada
-- avisa quem já passou. Por isso o loop de leads e o de processos rodam DUAS vezes; as funções
-- são idempotentes, então a 2ª passada só preenche o que ficou faltando, nunca duplica nada.
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
DECLARE v_conj uuid; v_estado text; v_c_nome text; v_c_cpf text; v_lead_cpf text; v_lead_nome text;
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
      AND NOT pessoa_e_de_operador(NEW.pessoa_id)
      AND ((renda_formal IS NULL AND NEW.renda_formal IS NOT NULL) OR (renda_informal IS NULL AND NEW.renda_informal IS NOT NULL));
  ELSIF TG_OP = 'UPDATE' AND NEW.pessoa_id IS NOT NULL THEN
    -- Renda editada no lead (tela antiga) → Pessoa (fonte nova). Coluna a coluna: não sobrescreve
    -- o campo irmão que não mudou (ex.: renda_informal gravada direto na Pessoa por outro caminho).
    IF NEW.renda_formal IS DISTINCT FROM OLD.renda_formal OR NEW.renda_informal IS DISTINCT FROM OLD.renda_informal THEN
      UPDATE pessoas SET
        renda_formal   = CASE WHEN NEW.renda_formal   IS DISTINCT FROM OLD.renda_formal   THEN NEW.renda_formal   ELSE renda_formal   END,
        renda_informal = CASE WHEN NEW.renda_informal IS DISTINCT FROM OLD.renda_informal THEN NEW.renda_informal ELSE renda_informal END
      WHERE id = NEW.pessoa_id
        AND NOT pessoa_e_de_operador(NEW.pessoa_id)
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
      -- Portão de identidade (mesmo princípio de fn_pv2_pessoas): a renda do cônjuge digitada no
      -- lead só vai pra Pessoa do cônjuge (C) quando C é comprovadamente a pessoa descrita no lead:
      --   CPF solto do lead = CPF de C; ou, sem CPF dos dois lados, mesmo 1º nome; ou o lead não
      --   tem identidade solta nenhuma (nome e CPF vazios — comportamento anterior).
      -- Senão (ex.: AbaPessoa gravando outra pessoa nos campos soltos) → NOTICE e não propaga.
      IF v_conj IS NOT NULL THEN
        SELECT nome, regexp_replace(coalesce(cpf, ''), '\D', '', 'g') INTO v_c_nome, v_c_cpf
        FROM pessoas WHERE id = v_conj AND deleted_at IS NULL;
        IF NOT FOUND THEN
          v_conj := NULL;
        ELSE
          v_lead_cpf  := regexp_replace(coalesce(NEW.conjuge_cpf, ''), '\D', '', 'g');
          v_lead_nome := coalesce(trim(NEW.conjuge_nome), '');
          IF NOT (
               (v_lead_cpf <> '' AND v_lead_cpf = v_c_cpf)
            OR (v_lead_cpf = '' AND v_c_cpf = '' AND v_lead_nome <> ''
                AND split_part(upper(v_lead_nome), ' ', 1) = split_part(upper(trim(coalesce(v_c_nome, ''))), ' ', 1))
            OR (v_lead_nome = '' AND v_lead_cpf = '')
          ) THEN
            RAISE NOTICE 'pv2: renda do cônjuge do lead NÃO propagada (campos soltos do lead não batem com a Pessoa do cônjuge): lead %, titular %, pessoa do cônjuge %',
              NEW.id, NEW.pessoa_id, v_conj;
            v_conj := NULL;
          END IF;
        END IF;
      END IF;
      IF v_conj IS NOT NULL THEN
        UPDATE pessoas SET
          renda_formal   = CASE WHEN NEW.conjuge_renda_formal   IS DISTINCT FROM OLD.conjuge_renda_formal   THEN NEW.conjuge_renda_formal   ELSE renda_formal   END,
          renda_informal = CASE WHEN NEW.conjuge_renda_informal IS DISTINCT FROM OLD.conjuge_renda_informal THEN NEW.conjuge_renda_informal ELSE renda_informal END
        WHERE id = v_conj
          AND NOT pessoa_e_de_operador(v_conj)
          AND NOT pessoa_e_de_operador(NEW.pessoa_id)
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
DECLARE r record; c pessoas%ROWTYPE; v_nome text; v_cpf text; v_nasc date; v_prof text; v_rf numeric; v_ri numeric;
  v_cpf_c text; v_cpf_novo text; v_bloqueio text;
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
  -- Também é explícito: estado civil voltando de não-casado para casado/união estável com o MESMO
  -- ponteiro (não nulo, inalterado) — ex.: divorciado → casado de novo com a mesma Pessoa.
  IF NEW.conjuge_pessoa_id IS NOT NULL
     AND coalesce(NEW.estado_civil, '') IN ('casado', 'uniao_estavel')
     AND (NEW.conjuge_pessoa_id IS DISTINCT FROM OLD.conjuge_pessoa_id
          OR coalesce(OLD.estado_civil, '') NOT IN ('casado', 'uniao_estavel')) THEN
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

  -- Campos soltos do cônjuge editados na tela antiga (AbaPessoa) → Pessoa do cônjuge (C).
  -- A regra de "espelho" (campo de C nulo ou igual ao OLD) sozinha não distingue correção de
  -- digitação de OUTRA pessoa — por isso, antes de qualquer campo, 4 portões de identidade:
  --   (A) só quando o titular JÁ era casado/união estável antes deste save e continua: o save de
  --       transição (divorciado → casado, digitando o novo cônjuge) nunca propaga — o ponteiro ainda
  --       aponta pro ex e os dados digitados são de outra pessoa;
  --   (B) CPF é identidade: C com CPF e CPF solto novo (não vazio) com outros dígitos = pessoa
  --       DIFERENTE → nada propaga neste save; CPF só é gravado em C quando C ainda não tem CPF;
  --   (C) troca de nome sem confirmação por CPF (CPF solto novo ≠ CPF de C, ou algum dos dois
  --       vazio) só passa se o 1º nome (upper/trim, acentos mantidos) for o mesmo de C;
  --   (D) nunca quando o ponteiro aponta pra própria pessoa.
  -- Bloqueio por (B)/(C) emite NOTICE e aparece no bloco 13 do diagnóstico (revisão manual).
  -- Mantidos: só com o titular casado (descasar limpa os campos soltos e não pode apagar os dados
  -- do ex) e nome nunca gravado vazio. C excluída, de outra empresa ou de operador nunca é tocada.
  -- UM único UPDATE em C: fn_sincronizar_pessoa_conjuge (migration 190) espelha C de volta nos
  -- campos soltos (nome/cpf/nascimento) uma vez só, já com os valores finais; o guard de
  -- profundidade (pg_trigger_depth() > 1) impede que isso volte a disparar esta função.
  IF NEW.conjuge_pessoa_id IS NOT NULL
     AND NEW.conjuge_pessoa_id <> NEW.id
     AND coalesce(NEW.estado_civil, '') IN ('casado', 'uniao_estavel')
     AND coalesce(OLD.estado_civil, '') IN ('casado', 'uniao_estavel')
     AND (NEW.conjuge_nome IS DISTINCT FROM OLD.conjuge_nome
       OR NEW.conjuge_cpf IS DISTINCT FROM OLD.conjuge_cpf
       OR NEW.conjuge_data_nascimento IS DISTINCT FROM OLD.conjuge_data_nascimento
       OR NEW.conjuge_profissao IS DISTINCT FROM OLD.conjuge_profissao
       OR NEW.conjuge_renda_formal IS DISTINCT FROM OLD.conjuge_renda_formal
       OR NEW.conjuge_renda_informal IS DISTINCT FROM OLD.conjuge_renda_informal)
     AND NOT pessoa_e_de_operador(NEW.conjuge_pessoa_id) THEN
    SELECT * INTO c FROM pessoas
    WHERE id = NEW.conjuge_pessoa_id AND deleted_at IS NULL AND empresa_id = NEW.empresa_id;
    IF FOUND THEN
      v_cpf_c    := regexp_replace(coalesce(c.cpf, ''), '\D', '', 'g');
      v_cpf_novo := regexp_replace(coalesce(NEW.conjuge_cpf, ''), '\D', '', 'g');
      v_bloqueio := NULL;
      -- (B) CPF diferente do de C = outra pessoa.
      IF v_cpf_c <> '' AND v_cpf_novo <> '' AND v_cpf_novo <> v_cpf_c THEN
        v_bloqueio := 'CPF solto difere do CPF da Pessoa do cônjuge';
      -- (C) nome trocado sem CPF confirmando: só com o mesmo 1º nome.
      ELSIF NEW.conjuge_nome IS DISTINCT FROM OLD.conjuge_nome AND coalesce(trim(NEW.conjuge_nome), '') <> ''
            AND NOT (v_cpf_c <> '' AND v_cpf_novo = v_cpf_c)
            AND split_part(upper(trim(NEW.conjuge_nome)), ' ', 1) IS DISTINCT FROM split_part(upper(trim(coalesce(c.nome, ''))), ' ', 1) THEN
        v_bloqueio := 'nome solto com outro 1º nome e sem CPF confirmando';
      END IF;

      IF v_bloqueio IS NOT NULL THEN
        RAISE NOTICE 'pv2: campos soltos do cônjuge NÃO propagados (%): titular %, pessoa do cônjuge %',
          v_bloqueio, NEW.id, c.id;
      ELSE
        v_nome := c.nome; v_cpf := c.cpf; v_nasc := c.data_nascimento; v_prof := c.profissao;
        v_rf := c.renda_formal; v_ri := c.renda_informal;
        -- Nome: nunca grava vazio (pessoas.nome é obrigatório). 'Cônjuge sem nome' é o nome que
        -- pv2_pessoa_de_campos_soltos dá quando o nome solto estava vazio — conta como espelho de vazio.
        IF NEW.conjuge_nome IS DISTINCT FROM OLD.conjuge_nome AND coalesce(trim(NEW.conjuge_nome), '') <> ''
           AND (c.nome IS NULL
             OR upper(trim(c.nome)) = upper(trim(coalesce(OLD.conjuge_nome, '')))
             OR (coalesce(trim(OLD.conjuge_nome), '') = '' AND c.nome = 'Cônjuge sem nome')) THEN
          v_nome := NEW.conjuge_nome;
        END IF;
        -- CPF: só quando C ainda NÃO tem CPF; só válido, gravado só com dígitos, e só se nenhuma
        -- OUTRA Pessoa ativa da empresa já tiver esses dígitos.
        IF v_cpf_c = '' AND NEW.conjuge_cpf IS DISTINCT FROM OLD.conjuge_cpf AND cpf_valido(NEW.conjuge_cpf)
           AND NOT EXISTS (
             SELECT 1 FROM pessoas o
             WHERE o.empresa_id = NEW.empresa_id AND o.deleted_at IS NULL AND o.id <> c.id
               AND regexp_replace(coalesce(o.cpf, ''), '\D', '', 'g') = v_cpf_novo
           ) THEN
          v_cpf := v_cpf_novo;
        END IF;
        IF NEW.conjuge_data_nascimento IS DISTINCT FROM OLD.conjuge_data_nascimento
           AND (c.data_nascimento IS NULL OR c.data_nascimento = OLD.conjuge_data_nascimento) THEN
          v_nasc := NEW.conjuge_data_nascimento;
        END IF;
        IF NEW.conjuge_profissao IS DISTINCT FROM OLD.conjuge_profissao
           AND (c.profissao IS NULL OR c.profissao = OLD.conjuge_profissao) THEN
          v_prof := NEW.conjuge_profissao;
        END IF;
        IF NEW.conjuge_renda_formal IS DISTINCT FROM OLD.conjuge_renda_formal
           AND (c.renda_formal IS NULL OR c.renda_formal = OLD.conjuge_renda_formal) THEN
          v_rf := NEW.conjuge_renda_formal;
        END IF;
        IF NEW.conjuge_renda_informal IS DISTINCT FROM OLD.conjuge_renda_informal
           AND (c.renda_informal IS NULL OR c.renda_informal = OLD.conjuge_renda_informal) THEN
          v_ri := NEW.conjuge_renda_informal;
        END IF;
        IF (v_nome, v_cpf, v_nasc, v_prof, v_rf, v_ri)
           IS DISTINCT FROM (c.nome, c.cpf, c.data_nascimento, c.profissao, c.renda_formal, c.renda_informal) THEN
          UPDATE pessoas SET nome = v_nome, cpf = v_cpf, data_nascimento = v_nasc, profissao = v_prof,
                             renda_formal = v_rf, renda_informal = v_ri
          WHERE id = c.id;
        END IF;
      END IF;
    END IF;
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
  conjuge_data_nascimento, conjuge_profissao, conjuge_renda_formal, conjuge_renda_informal,
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
  AND NOT pessoa_e_de_operador(p.id)
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

  -- 2ª passada: ponteiros preenchidos durante a 1ª passada (lead → pessoa, vendedor) precisam
  -- alcançar leads/processos já sincronizados; as funções são idempotentes, a 2ª passada não
  -- cria ponteiros novos.
  FOR r IN SELECT id FROM leads WHERE deleted_at IS NULL ORDER BY created_at LOOP
    PERFORM pv2_sincronizar_lead(r.id);
  END LOOP;
  FOR r IN SELECT id FROM processos WHERE deleted_at IS NULL ORDER BY created_at LOOP
    PERFORM pv2_sincronizar_processo(r.id);
  END LOOP;
END $$;

SELECT set_config('pv2.backfill', 'off', true);

COMMIT;
