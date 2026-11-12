-- ============================================================
-- REVERSÃO da migration 353 (cônjuge do vendedor no lead). Volta pv2_sincronizar_lead e fn_pv2_pessoas
-- às definições da 333 (texto copiado de lá) e tira dos leads os cônjuges de vendedor derivados.
-- Junto com o revert do PR do código (sem ele, o OCR "Cônjuge do vendedor" no lead registra o casamento
-- mas o cônjuge não aparece no lead — mesmo comportamento de antes da 353).
-- ============================================================
BEGIN;

CREATE OR REPLACE FUNCTION pv2_sincronizar_lead(p_lead_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  l leads%ROWTYPE; v_conj uuid; v_estado text; v_conj_de_campos_lead boolean := false; v_titular_operador boolean := false;
  v_pessoas uuid[] := '{}'; v_papeis text[] := '{}'; v_renda boolean[] := '{}'; v_ordens int[] := '{}';
  r record; i int;
BEGIN
  SELECT * INTO l FROM leads WHERE id = p_lead_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- Cônjuge: Pessoa do titular → Pessoa do lead → campos soltos do lead (vira Pessoa).
  -- Estado civil da Pessoa manda: divorciado/viúvo/solteiro = sem cônjuge, mesmo que
  -- leads.conjuge_pessoa_id ainda aponte pro ex (senão a sync "recasaria" a pessoa).
  -- Relacionamento encerrado nunca é recriado implicitamente: um ponteiro de lead ou campos
  -- soltos que ainda apontam/batem com um ex são descartados, não viram cônjuge de novo.
  -- Titular que é Pessoa de OPERADOR (lead criado pelo WhatsApp do comercial): sem derivação de
  -- cônjuge e sem nenhuma escrita de volta (leads.conjuge_pessoa_id / pessoas.conjuge_pessoa_id);
  -- o titular em si é filtrado por pv2_gravar_participacoes. Coparticipantes/vendedores seguem.
  v_titular_operador := l.pessoa_id IS NOT NULL AND pessoa_e_de_operador(l.pessoa_id);
  IF l.pessoa_id IS NOT NULL AND NOT v_titular_operador THEN
    PERFORM pv2_sincronizar_relacionamento_pessoa(l.pessoa_id);
    SELECT conjuge_pessoa_id, estado_civil INTO v_conj, v_estado FROM pessoas WHERE id = l.pessoa_id AND deleted_at IS NULL;
    -- Mesmo critério do ponteiro do lead (abaixo): ponteiro da Pessoa para um par ENCERRADO sem
    -- linha VIGENTE não é cônjuge (ex.: desvínculo que não limpou o ponteiro).
    IF v_conj IS NOT NULL
       AND EXISTS (SELECT 1 FROM pessoa_relacionamentos WHERE data_fim IS NOT NULL AND pessoa_a_id = least(l.pessoa_id, v_conj) AND pessoa_b_id = greatest(l.pessoa_id, v_conj))
       AND NOT EXISTS (SELECT 1 FROM pessoa_relacionamentos WHERE data_fim IS NULL AND pessoa_a_id = least(l.pessoa_id, v_conj) AND pessoa_b_id = greatest(l.pessoa_id, v_conj))
    THEN
      v_conj := NULL;
    END IF;
  END IF;
  v_estado := coalesce(v_estado, l.estado_civil);
  IF v_titular_operador THEN
    v_conj := NULL;
  ELSIF v_estado IN ('casado', 'uniao_estavel') THEN
    IF v_conj IS NULL AND l.conjuge_pessoa_id IS NOT NULL THEN
      v_conj := l.conjuge_pessoa_id;
      -- Só descarta o ponteiro do lead quando o par está de fato ENCERRADO (existe linha com
      -- data_fim) E não existe uma linha VIGENTE pro mesmo par (senão já recasaram, não é ex).
      IF l.pessoa_id IS NOT NULL
         AND EXISTS (SELECT 1 FROM pessoa_relacionamentos WHERE data_fim IS NOT NULL AND pessoa_a_id = least(l.pessoa_id, l.conjuge_pessoa_id) AND pessoa_b_id = greatest(l.pessoa_id, l.conjuge_pessoa_id))
         AND NOT EXISTS (SELECT 1 FROM pessoa_relacionamentos WHERE data_fim IS NULL AND pessoa_a_id = least(l.pessoa_id, l.conjuge_pessoa_id) AND pessoa_b_id = greatest(l.pessoa_id, l.conjuge_pessoa_id))
      THEN
        v_conj := NULL;
      END IF;
    END IF;
    IF v_conj IS NULL AND (coalesce(trim(l.conjuge_nome), '') <> '' OR l.conjuge_cpf IS NOT NULL)
       AND NOT pv2_ex_conjuge(l.pessoa_id, l.conjuge_nome, l.conjuge_cpf) THEN
      v_conj := pv2_pessoa_de_campos_soltos(l.empresa_id, l.conjuge_nome, l.conjuge_cpf, l.conjuge_data_nascimento,
                                            NULL, l.conjuge_renda_formal, l.conjuge_renda_informal);
      v_conj_de_campos_lead := v_conj IS NOT NULL;
    END IF;
  ELSE
    v_conj := NULL;
  END IF;
  -- Grava de volta só quando a sync CRIOU/ACHOU o cônjuge a partir dos campos soltos do lead
  -- (nunca quando veio do ponteiro da Pessoa — evita reescrever um desvínculo explícito).
  IF v_conj_de_campos_lead AND v_conj IS NOT NULL AND v_conj IS DISTINCT FROM l.pessoa_id THEN
    UPDATE leads SET conjuge_pessoa_id = v_conj WHERE id = l.id AND conjuge_pessoa_id IS NULL;
  END IF;
  IF v_conj IS NOT NULL AND v_conj IS DISTINCT FROM l.pessoa_id AND l.pessoa_id IS NOT NULL
     AND (v_conj_de_campos_lead OR l.conjuge_pessoa_id = v_conj)
     -- Bloqueia só quando o par está ENCERRADO e não há linha VIGENTE pro mesmo par.
     AND NOT (
       EXISTS (SELECT 1 FROM pessoa_relacionamentos WHERE data_fim IS NOT NULL AND pessoa_a_id = least(l.pessoa_id, v_conj) AND pessoa_b_id = greatest(l.pessoa_id, v_conj))
       AND NOT EXISTS (SELECT 1 FROM pessoa_relacionamentos WHERE data_fim IS NULL AND pessoa_a_id = least(l.pessoa_id, v_conj) AND pessoa_b_id = greatest(l.pessoa_id, v_conj))
     ) THEN
    UPDATE pessoas SET conjuge_pessoa_id = v_conj WHERE id = l.pessoa_id AND conjuge_pessoa_id IS NULL;
    PERFORM pv2_sincronizar_relacionamento_pessoa(l.pessoa_id);
  END IF;

  -- Ordem de prioridade: titular, cônjuge, coparticipantes, vendedores
  IF l.pessoa_id IS NOT NULL THEN
    v_pessoas := v_pessoas || l.pessoa_id; v_papeis := v_papeis || 'titular'::text; v_renda := v_renda || true; v_ordens := v_ordens || 1;
  END IF;
  IF v_conj IS NOT NULL THEN
    v_pessoas := v_pessoas || v_conj; v_papeis := v_papeis || 'conjuge_anuente'::text;
    v_renda := v_renda || coalesce(pv2_tem_renda(v_conj), false); v_ordens := v_ordens || 2;
  END IF;
  i := 3;
  -- C2: participantes de compra incluídos de propósito (explicita) vêm da própria participacoes; um ex-titular
  -- explícito vira coparticipante. lead_coparticipantes congelou.
  FOR r IN SELECT pessoa_id FROM participacoes
           WHERE lead_id = l.id AND explicita AND papel IN ('titular', 'coparticipante', 'conjuge_anuente')
             AND pessoa_id IS DISTINCT FROM l.pessoa_id
           ORDER BY ordem, created_at LOOP
    v_pessoas := v_pessoas || r.pessoa_id; v_papeis := v_papeis || 'coparticipante'::text; v_renda := v_renda || true; v_ordens := v_ordens || i; i := i + 1;
  END LOOP;
  i := 1;
  -- C2: vendedores incluídos de propósito (lead_vendedores congelou)
  FOR r IN SELECT pessoa_id FROM participacoes
           WHERE lead_id = l.id AND explicita AND papel = 'vendedor' ORDER BY ordem, created_at LOOP
    v_pessoas := v_pessoas || r.pessoa_id; v_papeis := v_papeis || 'vendedor'::text; v_renda := v_renda || false; v_ordens := v_ordens || i; i := i + 1;
  END LOOP;
  IF l.vendedor_pessoa_id IS NOT NULL THEN
    v_pessoas := v_pessoas || l.vendedor_pessoa_id; v_papeis := v_papeis || 'vendedor'::text; v_renda := v_renda || false; v_ordens := v_ordens || i;
  END IF;

  PERFORM pv2_gravar_participacoes(l.id, NULL, l.empresa_id, v_pessoas, v_papeis, v_renda, v_ordens);
END $$;

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
    FOR r IN SELECT DISTINCT processo_id FROM participacoes WHERE processo_id IS NOT NULL AND pessoa_id = OLD.conjuge_pessoa_id LOOP
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
  FOR r IN SELECT DISTINCT processo_id FROM participacoes WHERE processo_id IS NOT NULL AND pessoa_id = NEW.id LOOP
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

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT lead_id FROM participacoes WHERE lead_id IS NOT NULL AND papel = 'conjuge_vendedor' LOOP
    PERFORM pv2_sincronizar_lead(r.lead_id);
  END LOOP;
END $$;

COMMIT;
