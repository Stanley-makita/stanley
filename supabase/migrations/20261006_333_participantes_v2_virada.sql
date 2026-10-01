-- ============================================================
-- Migration 333: Participantes V2 — C2, a virada: participacoes vira a fonte.
--
-- Até aqui (Fase A + C1) os serviços gravavam nas tabelas antigas e os triggers trg_pv2_* copiavam
-- para participacoes. Agora:
--   1. participacoes.explicita marca quem foi incluído DE PROPÓSITO (titular, coparticipante, vendedor);
--      cônjuge anuente/cônjuge do vendedor continuam DERIVADOS do casamento pela sincronização.
--   2. pv2_sincronizar_lead/_processo leem os incluídos de participacoes (não mais das tabelas antigas).
--      Mesma regra de cônjuge, ordem e compõe renda. Diferença única: no negócio, o cônjuge do vendedor
--      vem do casamento registrado (antes vinha dos campos soltos conjuge_* da linha do vendedor).
--   3. Triggers trg_pv2_* das tabelas antigas saem; elas ficam SOMENTE LEITURA (INSERT/UPDATE recusados
--      com mensagem clara; DELETE em cascata continua). merge_pessoas libera a trava só na própria
--      transação (chave estrangeira).
--   4. atualizar_telefone_pessoa e fn_sincronizar_lead_pessoa param de copiar para processo_*.
--   5. trg_comrel_criar_cliente_processo sai (trg_comrel_criar_participacao, 330, já cobre).
-- Não ressincroniza nada em massa: as participações atuais ficam como estão até a próxima edição.
-- Antes: supabase/2026-10-06_diagnostico_c2.sql (mostra o que mudaria). Depois: o código do C2 no ar
-- logo em seguida (entre os dois, incluir/remover participante pela tela falha com a mensagem da trava).
-- Fora do horário. Reverter: supabase/2026-10-06_reverter_333.sql.
-- ============================================================
BEGIN;

-- 1. Incluídos de propósito
ALTER TABLE participacoes ADD COLUMN IF NOT EXISTS explicita BOOLEAN NOT NULL DEFAULT false;

UPDATE participacoes pa SET explicita = true
WHERE pa.lead_id IS NOT NULL AND NOT pa.explicita AND (
     EXISTS (SELECT 1 FROM lead_coparticipantes c WHERE c.lead_id = pa.lead_id AND c.pessoa_id = pa.pessoa_id)
  OR EXISTS (SELECT 1 FROM lead_vendedores v WHERE v.lead_id = pa.lead_id AND v.pessoa_id = pa.pessoa_id)
  OR EXISTS (SELECT 1 FROM leads l WHERE l.id = pa.lead_id AND pa.pessoa_id IN (l.pessoa_id, l.vendedor_pessoa_id)));

-- No negócio todo mundo veio de uma linha de processo_compradores/processo_vendedores, menos o cônjuge
-- do vendedor que só assina (derivado dos campos soltos da linha do vendedor).
UPDATE participacoes SET explicita = true
WHERE processo_id IS NOT NULL AND NOT explicita AND papel <> 'conjuge_vendedor';

-- 2. Sincronização lendo participacoes
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

CREATE OR REPLACE FUNCTION pv2_sincronizar_processo(p_processo_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  pr processos%ROWTYPE; r record; v_conj uuid; v_titular uuid; i int;
  v_compradores uuid[] := '{}'; v_vendedores uuid[] := '{}';
  v_pessoas uuid[] := '{}'; v_papeis text[] := '{}'; v_renda boolean[] := '{}'; v_ordens int[] := '{}';
BEGIN
  SELECT * INTO pr FROM processos WHERE id = p_processo_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- C2: quem participa de propósito (explicita) vem da própria participacoes — processo_compradores e
  -- processo_vendedores congelaram. Pessoa excluída, de outra empresa ou de operador fica de fora.
  SELECT coalesce(array_agg(pa.pessoa_id ORDER BY pa.ordem, pa.created_at), '{}') INTO v_compradores
  FROM participacoes pa
  JOIN pessoas px ON px.id = pa.pessoa_id AND px.deleted_at IS NULL AND px.empresa_id = pr.empresa_id
  WHERE pa.processo_id = pr.id AND pa.explicita AND pa.papel IN ('titular', 'coparticipante', 'conjuge_anuente')
    AND NOT pessoa_e_de_operador(pa.pessoa_id);
  SELECT coalesce(array_agg(pa.pessoa_id ORDER BY pa.ordem, pa.created_at), '{}') INTO v_vendedores
  FROM participacoes pa
  JOIN pessoas px ON px.id = pa.pessoa_id AND px.deleted_at IS NULL AND px.empresa_id = pr.empresa_id
  WHERE pa.processo_id = pr.id AND pa.explicita AND pa.papel = 'vendedor'
    AND NOT pessoa_e_de_operador(pa.pessoa_id)
    AND NOT pa.pessoa_id = ANY(v_compradores);

  -- Titular: o marcado como titular; sem nenhum, o primeiro comprador.
  SELECT pa.pessoa_id INTO v_titular FROM participacoes pa
  WHERE pa.processo_id = pr.id AND pa.explicita AND pa.papel = 'titular' AND pa.pessoa_id = ANY(v_compradores)
  LIMIT 1;
  IF v_titular IS NULL AND cardinality(v_compradores) > 0 THEN v_titular := v_compradores[1]; END IF;

  IF v_titular IS NOT NULL THEN
    PERFORM pv2_sincronizar_relacionamento_pessoa(v_titular);
    v_pessoas := v_pessoas || v_titular; v_papeis := v_papeis || 'titular'::text; v_renda := v_renda || true; v_ordens := v_ordens || 1;
    UPDATE processos SET pessoa_id = v_titular WHERE id = pr.id AND pessoa_id IS DISTINCT FROM v_titular;
  END IF;
  i := 2;
  FOR r IN SELECT x AS pessoa_id FROM unnest(v_compradores) WITH ORDINALITY AS t(x, n) ORDER BY n LOOP
    CONTINUE WHEN r.pessoa_id = v_titular;
    PERFORM pv2_sincronizar_relacionamento_pessoa(r.pessoa_id);
    -- Comprador casado com outro comprador do mesmo processo = cônjuge (mesma regra da 326).
    IF EXISTS (SELECT 1 FROM pessoa_relacionamentos rel
               WHERE rel.data_fim IS NULL AND r.pessoa_id IN (rel.pessoa_a_id, rel.pessoa_b_id)
                 AND (CASE WHEN rel.pessoa_a_id = r.pessoa_id THEN rel.pessoa_b_id ELSE rel.pessoa_a_id END) = ANY(v_compradores)) THEN
      v_pessoas := v_pessoas || r.pessoa_id; v_papeis := v_papeis || 'conjuge_anuente'::text;
      v_renda := v_renda || coalesce(pv2_tem_renda(r.pessoa_id), false);
    ELSE
      v_pessoas := v_pessoas || r.pessoa_id; v_papeis := v_papeis || 'coparticipante'::text; v_renda := v_renda || true;
    END IF;
    v_ordens := v_ordens || i; i := i + 1;
  END LOOP;

  -- Vendedores; o cônjuge (casamento vigente) de cada um assina junto como conjuge_vendedor, a menos que
  -- já esteja no negócio (vendedor também = proprietário, ou comprador).
  i := 1;
  FOR r IN SELECT x AS pessoa_id FROM unnest(v_vendedores) WITH ORDINALITY AS t(x, n) ORDER BY n LOOP
    v_pessoas := v_pessoas || r.pessoa_id; v_papeis := v_papeis || 'vendedor'::text; v_renda := v_renda || false; v_ordens := v_ordens || i; i := i + 1;
  END LOOP;
  FOR r IN SELECT x AS pessoa_id FROM unnest(v_vendedores) WITH ORDINALITY AS t(x, n) ORDER BY n LOOP
    PERFORM pv2_sincronizar_relacionamento_pessoa(r.pessoa_id);
    v_conj := NULL;
    SELECT CASE WHEN rel.pessoa_a_id = r.pessoa_id THEN rel.pessoa_b_id ELSE rel.pessoa_a_id END INTO v_conj
    FROM pessoa_relacionamentos rel
    JOIN pessoas px ON px.id = (CASE WHEN rel.pessoa_a_id = r.pessoa_id THEN rel.pessoa_b_id ELSE rel.pessoa_a_id END)
    WHERE rel.data_fim IS NULL AND r.pessoa_id IN (rel.pessoa_a_id, rel.pessoa_b_id)
      AND px.deleted_at IS NULL AND px.empresa_id = pr.empresa_id
    LIMIT 1;
    IF v_conj IS NOT NULL AND NOT v_conj = ANY(v_vendedores) AND NOT v_conj = ANY(v_compradores) THEN
      v_pessoas := v_pessoas || v_conj; v_papeis := v_papeis || 'conjuge_vendedor'::text; v_renda := v_renda || false;
      v_ordens := v_ordens || i; i := i + 1;
    END IF;
  END LOOP;

  PERFORM pv2_gravar_participacoes(NULL, pr.id, pr.empresa_id, v_pessoas, v_papeis, v_renda, v_ordens);
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

-- 3. Tabelas antigas: sem cópia automática, somente leitura
DROP TRIGGER IF EXISTS trg_pv2_lead_coparticipantes ON lead_coparticipantes;
DROP TRIGGER IF EXISTS trg_pv2_lead_vendedores ON lead_vendedores;
DROP TRIGGER IF EXISTS trg_pv2_processo_compradores ON processo_compradores;
DROP TRIGGER IF EXISTS trg_pv2_processo_vendedores ON processo_vendedores;
DROP TRIGGER IF EXISTS trg_comrel_criar_cliente_processo ON processo_compradores;

CREATE OR REPLACE FUNCTION fn_participantes_tabela_antiga_somente_leitura() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('pv2.legado', true) = 'on' THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'tabela_antiga_somente_leitura: % não recebe mais gravações (Participantes V2) — use participacoes', TG_TABLE_NAME;
END $$;
DROP TRIGGER IF EXISTS trg_somente_leitura ON lead_coparticipantes;
CREATE TRIGGER trg_somente_leitura BEFORE INSERT OR UPDATE ON lead_coparticipantes
  FOR EACH ROW EXECUTE FUNCTION fn_participantes_tabela_antiga_somente_leitura();
DROP TRIGGER IF EXISTS trg_somente_leitura ON lead_vendedores;
CREATE TRIGGER trg_somente_leitura BEFORE INSERT OR UPDATE ON lead_vendedores
  FOR EACH ROW EXECUTE FUNCTION fn_participantes_tabela_antiga_somente_leitura();
DROP TRIGGER IF EXISTS trg_somente_leitura ON processo_compradores;
CREATE TRIGGER trg_somente_leitura BEFORE INSERT OR UPDATE ON processo_compradores
  FOR EACH ROW EXECUTE FUNCTION fn_participantes_tabela_antiga_somente_leitura();
DROP TRIGGER IF EXISTS trg_somente_leitura ON processo_vendedores;
CREATE TRIGGER trg_somente_leitura BEFORE INSERT OR UPDATE ON processo_vendedores
  FOR EACH ROW EXECUTE FUNCTION fn_participantes_tabela_antiga_somente_leitura();

-- 4. Funções que copiavam para as tabelas antigas
CREATE OR REPLACE FUNCTION atualizar_telefone_pessoa(
  p_pessoa_id uuid,
  p_telefone  text,
  p_origem    text DEFAULT 'processos'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa_id   uuid;
  v_usuario_id   uuid;
  v_tel_id       uuid;
  v_tel_anterior text;
  v_telefone     text := NULLIF(TRIM(p_telefone), '');
BEGIN
  SELECT id, empresa_id INTO v_usuario_id, v_empresa_id
    FROM usuarios
    WHERE auth_user_id = auth.uid() AND ativo = true;

  IF v_usuario_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado ou inativo';
  END IF;

  IF v_telefone IS NULL THEN
    RAISE EXCEPTION 'Telefone não pode ser vazio';
  END IF;

  IF p_origem NOT IN ('leads', 'pessoas', 'processos') THEN
    RAISE EXCEPTION 'Origem inválida: %', p_origem;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pessoas WHERE id = p_pessoa_id AND empresa_id = v_empresa_id
  ) THEN
    RAISE EXCEPTION 'Pessoa não encontrada nesta empresa';
  END IF;

  SELECT id, telefone INTO v_tel_id, v_tel_anterior
    FROM pessoa_telefones
    WHERE pessoa_id = p_pessoa_id AND ativo = true
    ORDER BY principal DESC, created_at ASC
    LIMIT 1;

  IF v_tel_id IS NOT NULL THEN
    IF v_tel_anterior IS DISTINCT FROM v_telefone THEN
      UPDATE pessoa_telefones SET telefone = v_telefone WHERE id = v_tel_id;
    END IF;
  ELSE
    INSERT INTO pessoa_telefones (pessoa_id, empresa_id, telefone, principal, whatsapp, ativo)
    VALUES (p_pessoa_id, v_empresa_id, v_telefone, true, true, true);
  END IF;

  -- C2: processo_compradores/processo_vendedores congelaram (telefone mora em pessoa_telefones).

  UPDATE leads SET telefone = v_telefone
    WHERE pessoa_id = p_pessoa_id AND empresa_id = v_empresa_id
      AND telefone IS DISTINCT FROM v_telefone;

  -- contato_telefone é o número usado pra envio de mensagem (WhatsApp/site);
  -- não mexe em conversa de grupo (contato_grupo_id/@g.us, fora do escopo
  -- de telefone de pessoa física).
  UPDATE conversas SET contato_telefone = v_telefone
    WHERE pessoa_id = p_pessoa_id AND empresa_id = v_empresa_id
      AND contato_telefone IS DISTINCT FROM v_telefone
      AND contato_telefone NOT LIKE '%@g.us';

  IF v_tel_anterior IS DISTINCT FROM v_telefone THEN
    INSERT INTO pessoas_alteracoes (
      pessoa_id, empresa_id, usuario_id, campos_alterados,
      valores_anteriores, valores_novos, origem
    ) VALUES (
      p_pessoa_id, v_empresa_id, v_usuario_id, ARRAY['telefone'],
      jsonb_build_object('telefone', v_tel_anterior),
      jsonb_build_object('telefone', v_telefone),
      p_origem
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION fn_sincronizar_lead_pessoa()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.nome IS DISTINCT FROM OLD.nome
     OR NEW.cpf IS DISTINCT FROM OLD.cpf
     OR NEW.email IS DISTINCT FROM OLD.email THEN
    UPDATE leads
    SET nome  = NEW.nome,
        cpf   = NEW.cpf,
        email = NEW.email
    WHERE pessoa_id = NEW.id
      AND deleted_at IS NULL
      AND (nome IS DISTINCT FROM NEW.nome
        OR cpf IS DISTINCT FROM NEW.cpf
        OR email IS DISTINCT FROM NEW.email);
    -- C2: processo_compradores congelou (nome/CPF/e-mail são lidos da Pessoa).
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION merge_pessoas(p_principal uuid, p_secundaria uuid, p_empresa uuid, p_usuario uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  pri pessoas%ROWTYPE;
  sec pessoas%ROWTYPE;
  r record;
  v_outro uuid;
  v_tem_principal boolean;
  v_leads uuid[];
  v_processos uuid[];
BEGIN
  IF p_principal IS NULL OR p_secundaria IS NULL OR p_principal = p_secundaria THEN
    RAISE EXCEPTION 'merge_invalido';
  END IF;
  -- trava as duas (mesma ordem sempre) contra merges/edições simultâneos
  PERFORM pg_advisory_xact_lock(hashtext(least(p_principal, p_secundaria)::text));
  PERFORM pg_advisory_xact_lock(hashtext(greatest(p_principal, p_secundaria)::text));

  SELECT * INTO pri FROM pessoas WHERE id = p_principal AND empresa_id = p_empresa AND deleted_at IS NULL FOR UPDATE;
  SELECT * INTO sec FROM pessoas WHERE id = p_secundaria AND empresa_id = p_empresa AND deleted_at IS NULL FOR UPDATE;
  IF pri.id IS NULL OR sec.id IS NULL THEN RAISE EXCEPTION 'merge_pessoa_nao_encontrada'; END IF;
  IF pessoa_e_de_operador(p_principal) OR pessoa_e_de_operador(p_secundaria) THEN RAISE EXCEPTION 'merge_operador'; END IF;
  IF pri.conjuge_pessoa_id IS NOT NULL AND sec.conjuge_pessoa_id IS NOT NULL
     AND pri.conjuge_pessoa_id <> sec.conjuge_pessoa_id
     AND pri.conjuge_pessoa_id <> p_secundaria AND sec.conjuge_pessoa_id <> p_principal THEN
    RAISE EXCEPTION 'merge_conjuges_diferentes';
  END IF;

  -- Propostas afetadas (antes de mover) — ressincronizadas uma vez no fim. Durante a merge a
  -- sincronização da Fase A fica desligada (mesma chave do backfill, local à transação) pra não
  -- rodar sobre um estado pela metade.
  SELECT coalesce(array_agg(DISTINCT x), '{}') INTO v_leads FROM (
    SELECT id AS x FROM leads WHERE p_secundaria IN (pessoa_id, conjuge_pessoa_id, vendedor_pessoa_id)
       OR p_principal IN (pessoa_id, conjuge_pessoa_id, vendedor_pessoa_id)
    UNION SELECT lead_id FROM lead_coparticipantes WHERE pessoa_id IN (p_principal, p_secundaria)
    UNION SELECT lead_id FROM lead_vendedores WHERE pessoa_id IN (p_principal, p_secundaria)
    UNION SELECT lead_id FROM participacoes WHERE lead_id IS NOT NULL AND pessoa_id IN (p_principal, p_secundaria)
  ) t;
  SELECT coalesce(array_agg(DISTINCT x), '{}') INTO v_processos FROM (
    SELECT id AS x FROM processos WHERE pessoa_id IN (p_principal, p_secundaria)
    UNION SELECT processo_id FROM processo_compradores WHERE pessoa_id IN (p_principal, p_secundaria)
    UNION SELECT processo_id FROM processo_vendedores WHERE pessoa_id IN (p_principal, p_secundaria)
    UNION SELECT processo_id FROM participacoes WHERE processo_id IS NOT NULL AND pessoa_id IN (p_principal, p_secundaria)
  ) t;
  PERFORM set_config('pv2.backfill', 'on', true);
  -- C2: as tabelas antigas estão congeladas; a merge ainda precisa repontar as linhas delas (chave
  -- estrangeira para pessoas), então libera a trava só dentro desta transação.
  PERFORM set_config('pv2.legado', 'on', true);

  -- 1. Leads (o índice único de lead aberto por pessoa decide se dá)
  BEGIN
    UPDATE leads SET pessoa_id = p_principal WHERE pessoa_id = p_secundaria AND empresa_id = p_empresa;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'merge_dois_leads_abertos';
  END;
  UPDATE leads SET conjuge_pessoa_id  = CASE WHEN pessoa_id = p_principal THEN NULL ELSE p_principal END
    WHERE conjuge_pessoa_id = p_secundaria AND empresa_id = p_empresa;
  UPDATE leads SET conjuge_pessoa_id = NULL WHERE conjuge_pessoa_id = p_principal AND pessoa_id = p_principal;
  UPDATE leads SET vendedor_pessoa_id = p_principal WHERE vendedor_pessoa_id = p_secundaria AND empresa_id = p_empresa;

  -- 2. Participações (modelo novo) ANTES das tabelas antigas: a sincronização mantém as que já existem
  --    (preserva compoe_renda/compoe_renda_manual). Mesma proposta com as duas → fica a da principal.
  -- C2: a linha que fica herda da que sai a marca de incluída de propósito e, no negócio, o titular.
  FOR r IN DELETE FROM participacoes s WHERE s.pessoa_id = p_secundaria AND EXISTS (
             SELECT 1 FROM participacoes p WHERE p.pessoa_id = p_principal
               AND (p.lead_id = s.lead_id OR p.processo_id = s.processo_id))
           RETURNING s.lead_id, s.processo_id, s.explicita, s.papel LOOP
    UPDATE participacoes p SET
      explicita = p.explicita OR r.explicita,
      papel = CASE WHEN r.papel = 'titular' AND p.processo_id IS NOT NULL THEN 'titular' ELSE p.papel END
    WHERE p.pessoa_id = p_principal AND (p.lead_id = r.lead_id OR p.processo_id = r.processo_id);
  END LOOP;
  UPDATE participacoes SET pessoa_id = p_principal WHERE pessoa_id = p_secundaria;

  -- 3. Tabelas antigas de participantes (mesmo critério: na mesma proposta fica a linha da principal)
  DELETE FROM lead_coparticipantes s WHERE s.pessoa_id = p_secundaria AND EXISTS (
    SELECT 1 FROM lead_coparticipantes p WHERE p.lead_id = s.lead_id AND p.pessoa_id = p_principal);
  UPDATE lead_coparticipantes SET pessoa_id = p_principal WHERE pessoa_id = p_secundaria;
  -- a principal não pode ser coparticipante do lead do qual é titular
  DELETE FROM lead_coparticipantes c USING leads l
    WHERE c.lead_id = l.id AND c.pessoa_id = p_principal AND l.pessoa_id = p_principal;
  DELETE FROM lead_vendedores s WHERE s.pessoa_id = p_secundaria AND EXISTS (
    SELECT 1 FROM lead_vendedores p WHERE p.lead_id = s.lead_id AND p.pessoa_id = p_principal);
  UPDATE lead_vendedores SET pessoa_id = p_principal WHERE pessoa_id = p_secundaria;
  -- se a linha que sai era a do comprador principal, a da principal herda o "principal"
  UPDATE processo_compradores p SET principal = true FROM processo_compradores s
    WHERE s.pessoa_id = p_secundaria AND s.principal AND p.processo_id = s.processo_id AND p.pessoa_id = p_principal;
  DELETE FROM processo_compradores s WHERE s.pessoa_id = p_secundaria AND EXISTS (
    SELECT 1 FROM processo_compradores p WHERE p.processo_id = s.processo_id AND p.pessoa_id = p_principal);
  UPDATE processo_compradores SET pessoa_id = p_principal WHERE pessoa_id = p_secundaria AND empresa_id = p_empresa;
  DELETE FROM processo_vendedores s WHERE s.pessoa_id = p_secundaria AND EXISTS (
    SELECT 1 FROM processo_vendedores p WHERE p.processo_id = s.processo_id AND p.pessoa_id = p_principal);
  UPDATE processo_vendedores SET pessoa_id = p_principal WHERE pessoa_id = p_secundaria AND empresa_id = p_empresa;
  UPDATE processos SET pessoa_id = p_principal WHERE pessoa_id = p_secundaria AND empresa_id = p_empresa;

  -- 4. Telefones: repetido fica o da principal; principal continua sendo o da principal (se ela tiver)
  DELETE FROM pessoa_telefones s WHERE s.pessoa_id = p_secundaria AND EXISTS (
    SELECT 1 FROM pessoa_telefones p WHERE p.pessoa_id = p_principal AND p.telefone = s.telefone);
  SELECT EXISTS (SELECT 1 FROM pessoa_telefones WHERE pessoa_id = p_principal AND principal AND ativo) INTO v_tem_principal;
  UPDATE pessoa_telefones SET pessoa_id = p_principal, principal = CASE WHEN v_tem_principal THEN false ELSE principal END
    WHERE pessoa_id = p_secundaria;

  -- 5. Documentos de identificação: um por tipo — o da principal vence
  DELETE FROM pessoa_documentos_identificacao s WHERE s.pessoa_id = p_secundaria AND EXISTS (
    SELECT 1 FROM pessoa_documentos_identificacao p WHERE p.pessoa_id = p_principal AND p.tipo_documento = s.tipo_documento);
  UPDATE pessoa_documentos_identificacao SET pessoa_id = p_principal WHERE pessoa_id = p_secundaria;

  -- 6. Casamento: relacionamentos da secundária passam para a principal (entre as duas → some)
  FOR r IN SELECT * FROM pessoa_relacionamentos WHERE p_secundaria IN (pessoa_a_id, pessoa_b_id) LOOP
    v_outro := CASE WHEN r.pessoa_a_id = p_secundaria THEN r.pessoa_b_id ELSE r.pessoa_a_id END;
    IF v_outro = p_principal OR EXISTS (
      SELECT 1 FROM pessoa_relacionamentos x WHERE x.id <> r.id
        AND x.pessoa_a_id = least(v_outro, p_principal) AND x.pessoa_b_id = greatest(v_outro, p_principal)
        AND (x.data_fim IS NULL) = (r.data_fim IS NULL)) THEN
      DELETE FROM pessoa_relacionamentos WHERE id = r.id;
    ELSE
      UPDATE pessoa_relacionamentos SET pessoa_a_id = least(v_outro, p_principal), pessoa_b_id = greatest(v_outro, p_principal)
        WHERE id = r.id;
    END IF;
  END LOOP;
  UPDATE pessoas SET conjuge_pessoa_id = p_principal WHERE conjuge_pessoa_id = p_secundaria AND id <> p_principal;
  IF pri.conjuge_pessoa_id = p_secundaria THEN
    UPDATE pessoas SET conjuge_pessoa_id = NULL WHERE id = p_principal;
  ELSIF pri.conjuge_pessoa_id IS NULL AND sec.conjuge_pessoa_id IS NOT NULL AND sec.conjuge_pessoa_id <> p_principal THEN
    UPDATE pessoas SET conjuge_pessoa_id = sec.conjuge_pessoa_id,
      estado_civil = coalesce(sec.estado_civil, estado_civil),
      regime_casamento = coalesce(regime_casamento, sec.regime_casamento),
      data_casamento = coalesce(data_casamento, sec.data_casamento)
    WHERE id = p_principal;
  END IF;

  -- 7. Demais vínculos (sem unicidade por pessoa)
  UPDATE conversas SET pessoa_id = p_principal WHERE pessoa_id = p_secundaria AND empresa_id = p_empresa;
  UPDATE documentos SET pessoa_id = p_principal WHERE pessoa_id = p_secundaria;
  UPDATE documentos_compartilhamentos SET pessoa_id_destino = p_principal WHERE pessoa_id_destino = p_secundaria;
  UPDATE solicitacoes_operacionais SET pessoa_id = p_principal WHERE pessoa_id = p_secundaria;
  UPDATE email_envios SET pessoa_id = p_principal WHERE pessoa_id = p_secundaria;
  UPDATE fonti_marcas SET pessoa_id = p_principal WHERE pessoa_id = p_secundaria;
  UPDATE parceiros SET pessoa_id = p_principal WHERE pessoa_id = p_secundaria;
  UPDATE pessoa_fgts_contas SET pessoa_id = p_principal WHERE pessoa_id = p_secundaria;
  UPDATE financeiro_comissoes_pagar SET pessoa_id = p_principal WHERE pessoa_id = p_secundaria AND empresa_id = p_empresa;
  UPDATE pessoas_alteracoes SET pessoa_id = p_principal WHERE pessoa_id = p_secundaria;

  -- 8. Dados: só preenche o que a principal não tem (nunca sobrescreve). CPF sai da secundária antes
  --    (índice único de CPF por empresa).
  UPDATE pessoas SET cpf = NULL WHERE id = p_secundaria;
  UPDATE pessoas SET
    cpf = coalesce(cpf, sec.cpf), email = coalesce(email, sec.email), data_nascimento = coalesce(data_nascimento, sec.data_nascimento),
    observacoes = CASE WHEN sec.observacoes IS NULL OR sec.observacoes = '' THEN observacoes
                       WHEN observacoes IS NULL OR observacoes = '' THEN sec.observacoes
                       ELSE observacoes || E'\n\n' || sec.observacoes END,
    rg = coalesce(rg, sec.rg), profissao = coalesce(profissao, sec.profissao),
    estado_civil = coalesce(estado_civil, sec.estado_civil),
    renda_formal = coalesce(renda_formal, sec.renda_formal), renda_informal = coalesce(renda_informal, sec.renda_informal),
    nacionalidade = coalesce(nacionalidade, sec.nacionalidade), sexo = coalesce(sexo, sec.sexo),
    endereco_rua = coalesce(endereco_rua, sec.endereco_rua), endereco_numero = coalesce(endereco_numero, sec.endereco_numero),
    endereco_complemento = coalesce(endereco_complemento, sec.endereco_complemento),
    endereco_bairro = coalesce(endereco_bairro, sec.endereco_bairro), endereco_cidade = coalesce(endereco_cidade, sec.endereco_cidade),
    endereco_uf = coalesce(endereco_uf, sec.endereco_uf), endereco_cep = coalesce(endereco_cep, sec.endereco_cep),
    empresa_nome = coalesce(empresa_nome, sec.empresa_nome), empresa_cnpj = coalesce(empresa_cnpj, sec.empresa_cnpj),
    municipio_trabalho = coalesce(municipio_trabalho, sec.municipio_trabalho), uf_trabalho = coalesce(uf_trabalho, sec.uf_trabalho),
    conta_bancaria_banco = coalesce(conta_bancaria_banco, sec.conta_bancaria_banco),
    conta_bancaria_agencia = coalesce(conta_bancaria_agencia, sec.conta_bancaria_agencia),
    conta_bancaria_numero = coalesce(conta_bancaria_numero, sec.conta_bancaria_numero),
    conta_bancaria_digito = coalesce(conta_bancaria_digito, sec.conta_bancaria_digito),
    orgao_emissor = coalesce(orgao_emissor, sec.orgao_emissor), data_emissao = coalesce(data_emissao, sec.data_emissao),
    filiacao_mae = coalesce(filiacao_mae, sec.filiacao_mae), filiacao_pai = coalesce(filiacao_pai, sec.filiacao_pai),
    cidade_nascimento = coalesce(cidade_nascimento, sec.cidade_nascimento), estado_nascimento = coalesce(estado_nascimento, sec.estado_nascimento),
    registro_cnh = coalesce(registro_cnh, sec.registro_cnh), validade_cnh = coalesce(validade_cnh, sec.validade_cnh),
    primeira_habilitacao_cnh = coalesce(primeira_habilitacao_cnh, sec.primeira_habilitacao_cnh),
    particularidade = coalesce(particularidade, sec.particularidade), patrimonio_total = coalesce(patrimonio_total, sec.patrimonio_total)
  WHERE id = p_principal;

  -- 9. Histórico na principal e exclusão da secundária (nada mais aponta para ela)
  INSERT INTO pessoas_alteracoes (pessoa_id, empresa_id, usuario_id, campos_alterados, valores_anteriores, valores_novos, origem)
  VALUES (p_principal, p_empresa, p_usuario, ARRAY['merge'],
    jsonb_build_object('pessoa_mesclada_id', p_secundaria, 'nome', sec.nome, 'cpf', sec.cpf),
    jsonb_build_object('pessoa_principal_id', p_principal), 'pessoas');
  DELETE FROM pessoas WHERE id = p_secundaria;

  -- 10. Sincronização (Fase A) uma vez, com tudo no lugar
  PERFORM set_config('pv2.backfill', 'off', true);
  PERFORM set_config('pv2.legado', 'off', true);
  PERFORM pv2_sincronizar_relacionamento_pessoa(p_principal);
  FOR r IN SELECT unnest(v_leads) AS id LOOP PERFORM pv2_sincronizar_lead(r.id); END LOOP;
  FOR r IN SELECT unnest(v_processos) AS id LOOP PERFORM pv2_sincronizar_processo(r.id); END LOOP;

  RETURN jsonb_build_object('ok', true, 'pessoa_principal_id', p_principal);
END $$;

REVOKE ALL ON FUNCTION merge_pessoas(uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION merge_pessoas(uuid, uuid, uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION pv2_sincronizar_lead(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION pv2_sincronizar_lead(uuid) TO service_role;
REVOKE ALL ON FUNCTION pv2_sincronizar_processo(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION pv2_sincronizar_processo(uuid) TO service_role;

COMMIT;
