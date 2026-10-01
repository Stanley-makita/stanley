-- ============================================================
-- REVERSÃO da migration 333 (Participantes V2 — C2). Rodar só se a virada precisar ser desfeita,
-- junto com o revert do PR do código C2 (o código C1 volta a gravar nas tabelas antigas).
-- 1. Reconstrói as tabelas antigas a partir de participacoes (incluídos de propósito) — o que foi
--    incluído/removido depois da virada passa a valer nelas também.
-- 2. Tira a trava de somente leitura e religa os triggers trg_pv2_* (Fase A) e de comunicação.
-- 3. Volta as funções às versões anteriores (326/327/329/304/189/332).
-- A coluna participacoes.explicita fica (inofensiva).
-- ============================================================
BEGIN;
SELECT set_config('pv2.backfill', 'on', true);
SELECT set_config('pv2.legado', 'on', true);

-- 1. Tabelas antigas = participacoes explícitas
DELETE FROM lead_coparticipantes c WHERE NOT EXISTS (
  SELECT 1 FROM participacoes pa JOIN leads l ON l.id = pa.lead_id
  WHERE pa.lead_id = c.lead_id AND pa.pessoa_id = c.pessoa_id AND pa.explicita
    AND pa.papel IN ('titular', 'coparticipante', 'conjuge_anuente') AND pa.pessoa_id IS DISTINCT FROM l.pessoa_id);
INSERT INTO lead_coparticipantes (empresa_id, lead_id, pessoa_id)
SELECT pa.empresa_id, pa.lead_id, pa.pessoa_id FROM participacoes pa JOIN leads l ON l.id = pa.lead_id
WHERE pa.explicita AND pa.papel IN ('titular', 'coparticipante', 'conjuge_anuente') AND pa.pessoa_id IS DISTINCT FROM l.pessoa_id
ON CONFLICT DO NOTHING;
DELETE FROM lead_vendedores v WHERE NOT EXISTS (
  SELECT 1 FROM participacoes pa WHERE pa.lead_id = v.lead_id AND pa.pessoa_id = v.pessoa_id AND pa.explicita AND pa.papel = 'vendedor');
INSERT INTO lead_vendedores (empresa_id, lead_id, pessoa_id)
SELECT pa.empresa_id, pa.lead_id, pa.pessoa_id FROM participacoes pa JOIN leads l ON l.id = pa.lead_id
WHERE pa.explicita AND pa.papel = 'vendedor' AND pa.pessoa_id IS DISTINCT FROM l.vendedor_pessoa_id
ON CONFLICT DO NOTHING;

DELETE FROM processo_compradores c WHERE c.pessoa_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM participacoes pa WHERE pa.processo_id = c.processo_id AND pa.pessoa_id = c.pessoa_id AND pa.explicita
    AND pa.papel IN ('titular', 'coparticipante', 'conjuge_anuente'));
INSERT INTO processo_compradores (empresa_id, processo_id, pessoa_id, nome, cpf, email, principal, renda_mensal)
SELECT pa.empresa_id, pa.processo_id, pa.pessoa_id, p.nome, p.cpf, p.email, pa.papel = 'titular',
       nullif(coalesce(p.renda_formal, 0) + coalesce(p.renda_informal, 0), 0)
FROM participacoes pa JOIN pessoas p ON p.id = pa.pessoa_id
WHERE pa.processo_id IS NOT NULL AND pa.explicita AND pa.papel IN ('titular', 'coparticipante', 'conjuge_anuente')
  AND NOT EXISTS (SELECT 1 FROM processo_compradores c WHERE c.processo_id = pa.processo_id AND c.pessoa_id = pa.pessoa_id);
UPDATE processo_compradores c SET principal = (pa.papel = 'titular')
FROM participacoes pa WHERE pa.processo_id = c.processo_id AND pa.pessoa_id = c.pessoa_id AND c.principal IS DISTINCT FROM (pa.papel = 'titular');
DELETE FROM processo_vendedores v WHERE v.pessoa_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM participacoes pa WHERE pa.processo_id = v.processo_id AND pa.pessoa_id = v.pessoa_id AND pa.explicita AND pa.papel = 'vendedor');
INSERT INTO processo_vendedores (empresa_id, processo_id, pessoa_id, nome, cpf, email, banco, agencia, conta, estado_civil)
SELECT pa.empresa_id, pa.processo_id, pa.pessoa_id, p.nome, p.cpf, p.email,
       p.conta_bancaria_banco, p.conta_bancaria_agencia, p.conta_bancaria_numero, p.estado_civil
FROM participacoes pa JOIN pessoas p ON p.id = pa.pessoa_id
WHERE pa.processo_id IS NOT NULL AND pa.explicita AND pa.papel = 'vendedor'
  AND NOT EXISTS (SELECT 1 FROM processo_vendedores v WHERE v.processo_id = pa.processo_id AND v.pessoa_id = pa.pessoa_id);

-- 2. Trava e triggers
DROP TRIGGER IF EXISTS trg_somente_leitura ON lead_coparticipantes;
DROP TRIGGER IF EXISTS trg_somente_leitura ON lead_vendedores;
DROP TRIGGER IF EXISTS trg_somente_leitura ON processo_compradores;
DROP TRIGGER IF EXISTS trg_somente_leitura ON processo_vendedores;
DROP FUNCTION IF EXISTS fn_participantes_tabela_antiga_somente_leitura();

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
  FOR r IN SELECT pessoa_id FROM lead_coparticipantes WHERE lead_id = l.id ORDER BY created_at LOOP
    v_pessoas := v_pessoas || r.pessoa_id; v_papeis := v_papeis || 'coparticipante'::text; v_renda := v_renda || true; v_ordens := v_ordens || i; i := i + 1;
  END LOOP;
  i := 1;
  FOR r IN SELECT pessoa_id FROM lead_vendedores WHERE lead_id = l.id ORDER BY created_at LOOP
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
  pr processos%ROWTYPE; r record; v_pid uuid; v_conj uuid; v_titular uuid; i int;
  v_compradores uuid[] := '{}';
  v_pessoas uuid[] := '{}'; v_papeis text[] := '{}'; v_renda boolean[] := '{}'; v_ordens int[] := '{}';
BEGIN
  SELECT * INTO pr FROM processos WHERE id = p_processo_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- Compradores sem Pessoa ganham uma (por CPF ou nova) e o pessoa_id é gravado de volta.
  FOR r IN SELECT * FROM processo_compradores WHERE processo_id = pr.id AND pessoa_id IS NULL LOOP
    v_pid := pv2_pessoa_de_campos_soltos(pr.empresa_id, r.nome, r.cpf, NULL, NULL, r.renda_mensal, NULL);
    IF v_pid IS NOT NULL THEN UPDATE processo_compradores SET pessoa_id = v_pid WHERE id = r.id; END IF;
  END LOOP;

  -- Titular: principal; sem principal, o mais antigo.
  SELECT pessoa_id INTO v_titular FROM processo_compradores
  WHERE processo_id = pr.id AND pessoa_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM pessoas px WHERE px.id = processo_compradores.pessoa_id AND px.deleted_at IS NULL AND px.empresa_id = pr.empresa_id)
    AND NOT pessoa_e_de_operador(processo_compradores.pessoa_id)
  ORDER BY principal DESC, created_at LIMIT 1;
  SELECT coalesce(array_agg(pessoa_id), '{}') INTO v_compradores FROM processo_compradores
  WHERE processo_id = pr.id AND pessoa_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM pessoas px WHERE px.id = processo_compradores.pessoa_id AND px.deleted_at IS NULL AND px.empresa_id = pr.empresa_id)
    AND NOT pessoa_e_de_operador(processo_compradores.pessoa_id);

  IF v_titular IS NOT NULL THEN
    PERFORM pv2_sincronizar_relacionamento_pessoa(v_titular);
    v_pessoas := v_pessoas || v_titular; v_papeis := v_papeis || 'titular'::text; v_renda := v_renda || true; v_ordens := v_ordens || 1;
  END IF;
  i := 2;
  FOR r IN SELECT pessoa_id FROM processo_compradores
           WHERE processo_id = pr.id AND pessoa_id IS NOT NULL AND pessoa_id IS DISTINCT FROM v_titular
             AND EXISTS (SELECT 1 FROM pessoas px WHERE px.id = processo_compradores.pessoa_id AND px.deleted_at IS NULL AND px.empresa_id = pr.empresa_id)
             AND NOT pessoa_e_de_operador(processo_compradores.pessoa_id)
           ORDER BY created_at LOOP
    PERFORM pv2_sincronizar_relacionamento_pessoa(r.pessoa_id);
    -- Comprador casado com outro comprador do mesmo processo = cônjuge.
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

  -- Vendedores (+ cônjuge em campos soltos: proprietário = vendedor, senão só assina)
  i := 1;
  FOR r IN SELECT * FROM processo_vendedores WHERE processo_id = pr.id ORDER BY created_at LOOP
    v_pid := r.pessoa_id;
    IF v_pid IS NULL THEN
      v_pid := pv2_pessoa_de_campos_soltos(pr.empresa_id, r.nome, r.cpf, NULL, NULL, NULL, NULL);
      IF v_pid IS NOT NULL THEN UPDATE processo_vendedores SET pessoa_id = v_pid WHERE id = r.id; END IF;
    END IF;
    IF v_pid IS NULL THEN CONTINUE; END IF;
    UPDATE pessoas SET conta_bancaria_banco = coalesce(conta_bancaria_banco, r.banco),
                       conta_bancaria_agencia = coalesce(conta_bancaria_agencia, r.agencia),
                       conta_bancaria_numero = coalesce(conta_bancaria_numero, r.conta)
    WHERE id = v_pid AND (conta_bancaria_banco IS NULL AND r.banco IS NOT NULL
                       OR conta_bancaria_agencia IS NULL AND r.agencia IS NOT NULL
                       OR conta_bancaria_numero IS NULL AND r.conta IS NOT NULL);
    v_pessoas := v_pessoas || v_pid; v_papeis := v_papeis || 'vendedor'::text; v_renda := v_renda || false; v_ordens := v_ordens || i; i := i + 1;
    IF coalesce(trim(r.conjuge_nome), '') <> '' OR r.conjuge_cpf IS NOT NULL THEN
      -- Reuse existing related pessoa: first from vigente relacionamento, else conjuge_pessoa_id
      v_conj := NULL;
      SELECT CASE WHEN rel.pessoa_a_id = v_pid THEN rel.pessoa_b_id ELSE rel.pessoa_a_id END
      INTO v_conj FROM pessoa_relacionamentos rel
      JOIN pessoas px ON px.id = (CASE WHEN rel.pessoa_a_id = v_pid THEN rel.pessoa_b_id ELSE rel.pessoa_a_id END)
      WHERE rel.data_fim IS NULL AND v_pid IN (rel.pessoa_a_id, rel.pessoa_b_id) AND px.deleted_at IS NULL
      LIMIT 1;
      IF v_conj IS NULL THEN
        SELECT conjuge_pessoa_id INTO v_conj FROM pessoas WHERE id = v_pid AND deleted_at IS NULL;
      END IF;
      -- Create new pessoa only if neither exists, e nunca reconverte um ex (campos soltos que
      -- ainda apontam/batem com um relacionamento já encerrado do vendedor).
      IF v_conj IS NULL AND NOT pv2_ex_conjuge(v_pid, r.conjuge_nome, r.conjuge_cpf) THEN
        v_conj := pv2_pessoa_de_campos_soltos(pr.empresa_id, r.conjuge_nome, r.conjuge_cpf, r.conjuge_data_nasc, NULL, NULL, NULL);
      END IF;
      IF v_conj IS NOT NULL AND v_conj <> v_pid THEN
        UPDATE pessoas SET conjuge_pessoa_id = v_conj WHERE id = v_pid AND conjuge_pessoa_id IS NULL;
        -- Implícito: não recria um relacionamento já encerrado entre vendedor e este cônjuge.
        PERFORM pv2_garantir_relacionamento(pr.empresa_id, v_pid, v_conj,
          CASE WHEN r.estado_civil = 'uniao_estavel' THEN 'uniao_estavel' ELSE 'casamento' END, NULL, NULL);
        v_pessoas := v_pessoas || v_conj;
        v_papeis := v_papeis || (CASE WHEN r.conjuge_papel = 'proprietario' THEN 'vendedor' ELSE 'conjuge_vendedor' END);
        v_renda := v_renda || false; v_ordens := v_ordens || i; i := i + 1;
      END IF;
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

CREATE OR REPLACE FUNCTION fn_pv2_processo_filhos() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NULL; END IF;
  IF current_setting('pv2.backfill', true) = 'on' THEN RETURN NULL; END IF;
  IF TG_OP = 'DELETE' THEN
    PERFORM pv2_sincronizar_processo(OLD.processo_id);
  ELSE
    PERFORM pv2_sincronizar_processo(NEW.processo_id);
    PERFORM pv2_copiar_contato_linhas_antigas(NEW.processo_id);
    IF TG_OP = 'UPDATE' AND OLD.processo_id IS DISTINCT FROM NEW.processo_id THEN
      PERFORM pv2_sincronizar_processo(OLD.processo_id);
    END IF;
  END IF;
  RETURN NULL;
END $$;

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

  UPDATE processo_compradores SET telefone = v_telefone
    WHERE pessoa_id = p_pessoa_id AND empresa_id = v_empresa_id
      AND telefone IS DISTINCT FROM v_telefone;

  UPDATE processo_vendedores SET telefone = v_telefone
    WHERE pessoa_id = p_pessoa_id AND empresa_id = v_empresa_id
      AND telefone IS DISTINCT FROM v_telefone;

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

    UPDATE processo_compradores
    SET nome  = NEW.nome,
        cpf   = NEW.cpf,
        email = NEW.email
    WHERE pessoa_id = NEW.id
      AND (nome IS DISTINCT FROM NEW.nome
        OR cpf IS DISTINCT FROM NEW.cpf
        OR email IS DISTINCT FROM NEW.email);
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
  DELETE FROM participacoes s WHERE s.pessoa_id = p_secundaria AND EXISTS (
    SELECT 1 FROM participacoes p WHERE p.pessoa_id = p_principal
      AND (p.lead_id = s.lead_id OR p.processo_id = s.processo_id));
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
  PERFORM pv2_sincronizar_relacionamento_pessoa(p_principal);
  FOR r IN SELECT unnest(v_leads) AS id LOOP PERFORM pv2_sincronizar_lead(r.id); END LOOP;
  FOR r IN SELECT unnest(v_processos) AS id LOOP PERFORM pv2_sincronizar_processo(r.id); END LOOP;

  RETURN jsonb_build_object('ok', true, 'pessoa_principal_id', p_principal);
END $$;

CREATE OR REPLACE FUNCTION fn_criar_comrel_cliente_processo()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO comunicacao_relacionamentos (empresa_id, papel, processo_id, processo_comprador_id)
  VALUES (NEW.empresa_id, 'cliente', NEW.processo_id, NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pv2_lead_coparticipantes AFTER INSERT OR UPDATE OR DELETE ON lead_coparticipantes
  FOR EACH ROW EXECUTE FUNCTION fn_pv2_lead_filhos();
CREATE TRIGGER trg_pv2_lead_vendedores AFTER INSERT OR UPDATE OR DELETE ON lead_vendedores
  FOR EACH ROW EXECUTE FUNCTION fn_pv2_lead_filhos();
CREATE TRIGGER trg_pv2_processo_compradores AFTER INSERT OR UPDATE OR DELETE ON processo_compradores
  FOR EACH ROW EXECUTE FUNCTION fn_pv2_processo_filhos();
CREATE TRIGGER trg_pv2_processo_vendedores AFTER INSERT OR UPDATE OR DELETE ON processo_vendedores
  FOR EACH ROW EXECUTE FUNCTION fn_pv2_processo_filhos();
CREATE TRIGGER trg_comrel_criar_cliente_processo AFTER INSERT ON processo_compradores
  FOR EACH ROW EXECUTE FUNCTION fn_criar_comrel_cliente_processo();

REVOKE ALL ON FUNCTION merge_pessoas(uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION merge_pessoas(uuid, uuid, uuid, uuid) TO service_role;

SELECT set_config('pv2.legado', 'off', true);
SELECT set_config('pv2.backfill', 'off', true);
COMMIT;
