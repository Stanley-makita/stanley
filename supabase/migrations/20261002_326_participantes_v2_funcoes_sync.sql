-- ============================================================
-- Migration 326: Participantes V2 — funções de sincronização (mão única: antigo → novo)
-- Idempotentes. Usadas pelo backfill e pelos triggers (migration 327).
-- Única escrita nas tabelas antigas: preencher pessoa_id/conjuge_pessoa_id que estavam
-- vazios com a Pessoa criada a partir de campos soltos (converge o modelo antigo).
--
-- Fix round 1 (2026-10-02): um relacionamento ENCERRADO nunca é recriado implicitamente pela
-- sync — só um vínculo explícito (tela antiga gravando pessoas.conjuge_pessoa_id de novo) refaz.
-- Sem isso, "Desvincular cônjuge" (src/app/api/leads/[id]/vincular-conjuge/route.ts) era desfeito
-- pela própria sync: o titular ficava com estado_civil='casado' e os campos soltos
-- conjuge_nome/conjuge_cpf (cache mantido por fn_sincronizar_pessoa_conjuge, migration 190) ainda
-- apontavam pro ex, e a sync recriava o relacionamento e a participação a partir deles.
-- ============================================================

CREATE OR REPLACE FUNCTION pv2_pessoa_de_campos_soltos(
  p_empresa_id uuid, p_nome text, p_cpf text, p_nascimento date, p_profissao text,
  p_renda_formal numeric, p_renda_informal numeric
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cpf text; v_id uuid;
BEGIN
  v_cpf := CASE WHEN cpf_valido(p_cpf) THEN regexp_replace(p_cpf, '\D', '', 'g') END;
  IF coalesce(trim(p_nome), '') = '' AND v_cpf IS NULL THEN RETURN NULL; END IF;
  IF v_cpf IS NOT NULL THEN
    SELECT id INTO v_id FROM pessoas
    WHERE empresa_id = p_empresa_id AND deleted_at IS NULL
      AND regexp_replace(coalesce(cpf, ''), '\D', '', 'g') = v_cpf
      AND NOT pessoa_e_de_operador(id)
    ORDER BY created_at
    LIMIT 1;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
    -- CPF já pertence a uma Pessoa de OPERADOR (não-cliente): não cria uma segunda Pessoa com o
    -- mesmo CPF (violaria pessoas_empresa_cpf_ativo_unique, migration 086) nem transforma um
    -- operador em participante por tabela dupla.
    IF EXISTS (
      SELECT 1 FROM pessoas
      WHERE empresa_id = p_empresa_id AND deleted_at IS NULL
        AND regexp_replace(coalesce(cpf, ''), '\D', '', 'g') = v_cpf
        AND pessoa_e_de_operador(id)
    ) THEN
      RETURN NULL;
    END IF;
  END IF;
  -- tipo = 'cliente' igual à rota vincular-conjuge; status_identidade fica no default da tabela.
  INSERT INTO pessoas (empresa_id, nome, cpf, data_nascimento, profissao, renda_formal, renda_informal, tipo)
  VALUES (p_empresa_id, coalesce(nullif(trim(p_nome), ''), 'Cônjuge sem nome'), v_cpf, p_nascimento, p_profissao, p_renda_formal, p_renda_informal, 'cliente')
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- p_explicito = true só quando a chamada vem de um vínculo EXPLÍCITO (tela antiga apontando
-- pessoas.conjuge_pessoa_id pra esse cônjuge). Nesse caso, e só nesse caso, um relacionamento
-- encerrado entre o mesmo par pode ser recriado. Toda sync implícita (default false) nunca refaz.
-- DROP antes do CREATE OR REPLACE: evita overload ambíguo de 6 args caso essa versão já tenha
-- sido aplicada antes (CREATE OR REPLACE não troca assinatura, só cria uma sobrecarga nova).
DROP FUNCTION IF EXISTS pv2_garantir_relacionamento(uuid, uuid, uuid, text, text, date);
CREATE OR REPLACE FUNCTION pv2_garantir_relacionamento(
  p_empresa_id uuid, p1 uuid, p2 uuid, p_tipo text, p_regime text, p_data date, p_explicito boolean DEFAULT false
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_a uuid := least(p1, p2); v_b uuid := greatest(p1, p2); v_id uuid;
BEGIN
  IF p1 IS NULL OR p2 IS NULL OR p1 = p2 THEN RETURN; END IF;
  SELECT id INTO v_id FROM pessoa_relacionamentos
  WHERE pessoa_a_id = v_a AND pessoa_b_id = v_b AND data_fim IS NULL;
  IF v_id IS NOT NULL THEN
    -- Fill-only: preenche campos vazios, não altera tipo (explicit edits propagate via trigger fn_pv2_pessoas em migration 327)
    UPDATE pessoa_relacionamentos
    SET regime_bens = coalesce(regime_bens, p_regime),
        data_inicio = coalesce(data_inicio, p_data)
    WHERE id = v_id
      AND ((regime_bens IS NULL AND p_regime IS NOT NULL)
        OR (data_inicio IS NULL AND p_data IS NOT NULL));
    RETURN;
  END IF;
  -- Relacionamento encerrado entre esse par nunca é recriado implicitamente — só um vínculo
  -- explícito (fn_pv2_pessoas, tela antiga apontando o ponteiro pra esse cônjuge de novo) refaz.
  IF NOT p_explicito AND EXISTS (
    SELECT 1 FROM pessoa_relacionamentos WHERE pessoa_a_id = v_a AND pessoa_b_id = v_b AND data_fim IS NOT NULL
  ) THEN
    RETURN;
  END IF;
  -- Uma das duas já tem outro casamento vigente: não decide sozinho (aparece no diagnóstico).
  IF EXISTS (SELECT 1 FROM pessoa_relacionamentos
             WHERE data_fim IS NULL AND (pessoa_a_id IN (v_a, v_b) OR pessoa_b_id IN (v_a, v_b))) THEN
    RETURN;
  END IF;
  INSERT INTO pessoa_relacionamentos (empresa_id, pessoa_a_id, pessoa_b_id, tipo, regime_bens, data_inicio)
  VALUES (p_empresa_id, v_a, v_b, coalesce(p_tipo, 'casamento'), p_regime, p_data);
END $$;

-- true se p_pessoa_id já teve um relacionamento ENCERRADO com alguém que bate com p_nome/p_cpf
-- (por CPF, se os dígitos não forem vazios, ou por nome, se não for vazio) E não existe hoje um
-- relacionamento VIGENTE pro mesmo par (senão não é "ex": casaram, terminaram, casaram nessa
-- ordenação de novo — o par voltou a estar junto e não é mais bloqueado). Usado pra impedir a
-- reconversão de campos soltos (conjuge_nome/conjuge_cpf) que ainda apontam pro ex depois de um
-- "Desvincular cônjuge" — esses campos soltos não são limpos pela rota antiga nem pela sync.
CREATE OR REPLACE FUNCTION pv2_ex_conjuge(p_pessoa_id uuid, p_nome text, p_cpf text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM pessoa_relacionamentos rel
    JOIN pessoas partner ON partner.id = (CASE WHEN rel.pessoa_a_id = p_pessoa_id THEN rel.pessoa_b_id ELSE rel.pessoa_a_id END)
    WHERE rel.data_fim IS NOT NULL
      AND p_pessoa_id IN (rel.pessoa_a_id, rel.pessoa_b_id)
      AND partner.deleted_at IS NULL
      AND (
        (regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g') <> ''
         AND regexp_replace(coalesce(partner.cpf, ''), '\D', '', 'g') = regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g'))
        OR
        (coalesce(trim(p_nome), '') <> '' AND upper(trim(partner.nome)) = upper(trim(p_nome)))
      )
      AND NOT EXISTS (
        SELECT 1 FROM pessoa_relacionamentos v
        WHERE v.data_fim IS NULL
          AND v.pessoa_a_id = least(p_pessoa_id, partner.id) AND v.pessoa_b_id = greatest(p_pessoa_id, partner.id)
      )
  );
$$;

CREATE OR REPLACE FUNCTION pv2_sincronizar_relacionamento_pessoa(p_pessoa_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p pessoas%ROWTYPE; v_conj uuid;
BEGIN
  -- Pessoa de operador nunca ganha cônjuge/relacionamento pela sync (nem Pessoa nova por campos soltos).
  IF pessoa_e_de_operador(p_pessoa_id) THEN RETURN; END IF;
  SELECT * INTO p FROM pessoas WHERE id = p_pessoa_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RETURN; END IF;
  v_conj := p.conjuge_pessoa_id;
  IF v_conj IS NULL AND p.estado_civil IN ('casado', 'uniao_estavel')
     AND (coalesce(trim(p.conjuge_nome), '') <> '' OR p.conjuge_cpf IS NOT NULL)
     AND NOT pv2_ex_conjuge(p.id, p.conjuge_nome, p.conjuge_cpf) THEN
    v_conj := pv2_pessoa_de_campos_soltos(p.empresa_id, p.conjuge_nome, p.conjuge_cpf, p.conjuge_data_nascimento,
                                          p.conjuge_profissao, p.conjuge_renda_formal, p.conjuge_renda_informal);
    IF v_conj IS NOT NULL AND v_conj <> p.id THEN
      UPDATE pessoas SET conjuge_pessoa_id = v_conj WHERE id = p.id;
    END IF;
  END IF;
  IF v_conj IS NOT NULL AND v_conj <> p.id AND p.estado_civil IN ('casado', 'uniao_estavel') THEN
    -- Implícito (default false): não recria um relacionamento que já foi encerrado com este par.
    PERFORM pv2_garantir_relacionamento(p.empresa_id, p.id, v_conj,
      CASE WHEN p.estado_civil = 'uniao_estavel' THEN 'uniao_estavel' ELSE 'casamento' END,
      p.regime_casamento, p.data_casamento);
  END IF;
END $$;

-- Grava o conjunto desejado de um lead OU processo. Arrays em ordem de prioridade:
-- se a mesma pessoa aparecer duas vezes, vale a primeira ocorrência.
CREATE OR REPLACE FUNCTION pv2_gravar_participacoes(
  p_lead_id uuid, p_processo_id uuid, p_empresa_id uuid,
  p_pessoas uuid[], p_papeis text[], p_renda boolean[], p_ordens int[]
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_titular uuid;
BEGIN
  IF to_regclass('pg_temp.pv2_desejadas') IS NULL THEN
    CREATE TEMP TABLE pv2_desejadas (pessoa_id uuid, papel text, compoe_renda boolean, ordem int) ON COMMIT DROP;
  END IF;
  TRUNCATE pg_temp.pv2_desejadas;
  INSERT INTO pg_temp.pv2_desejadas
  SELECT DISTINCT ON (x.pessoa_id) x.pessoa_id, x.papel, x.renda, x.ordem
  FROM unnest(p_pessoas, p_papeis, p_renda, p_ordens) WITH ORDINALITY AS x(pessoa_id, papel, renda, ordem, prioridade)
  WHERE x.pessoa_id IS NOT NULL AND NOT pessoa_e_de_operador(x.pessoa_id) AND EXISTS (SELECT 1 FROM pessoas px WHERE px.id = x.pessoa_id AND px.deleted_at IS NULL AND px.empresa_id = p_empresa_id)
  ORDER BY x.pessoa_id, x.prioridade;

  SELECT pessoa_id INTO v_titular FROM pg_temp.pv2_desejadas WHERE papel = 'titular';

  DELETE FROM participacoes pa
  WHERE ((p_lead_id IS NOT NULL AND pa.lead_id = p_lead_id) OR (p_processo_id IS NOT NULL AND pa.processo_id = p_processo_id))
    AND NOT EXISTS (SELECT 1 FROM pg_temp.pv2_desejadas d WHERE d.pessoa_id = pa.pessoa_id);

  -- Rebaixa o titular antigo antes de promover o novo (índice de titular único).
  UPDATE participacoes pa SET papel = 'coparticipante'
  WHERE ((p_lead_id IS NOT NULL AND pa.lead_id = p_lead_id) OR (p_processo_id IS NOT NULL AND pa.processo_id = p_processo_id))
    AND pa.papel = 'titular' AND pa.pessoa_id IS DISTINCT FROM v_titular;

  IF p_lead_id IS NOT NULL THEN
    INSERT INTO participacoes (empresa_id, lead_id, pessoa_id, papel, compoe_renda, ordem)
    SELECT p_empresa_id, p_lead_id, d.pessoa_id, d.papel, d.compoe_renda, d.ordem FROM pg_temp.pv2_desejadas d
    ON CONFLICT (lead_id, pessoa_id) WHERE lead_id IS NOT NULL
    DO UPDATE SET papel = EXCLUDED.papel, compoe_renda = EXCLUDED.compoe_renda, ordem = EXCLUDED.ordem
    WHERE (participacoes.papel, participacoes.compoe_renda, participacoes.ordem)
          IS DISTINCT FROM (EXCLUDED.papel, EXCLUDED.compoe_renda, EXCLUDED.ordem);
  ELSE
    INSERT INTO participacoes (empresa_id, processo_id, pessoa_id, papel, compoe_renda, ordem)
    SELECT p_empresa_id, p_processo_id, d.pessoa_id, d.papel, d.compoe_renda, d.ordem FROM pg_temp.pv2_desejadas d
    ON CONFLICT (processo_id, pessoa_id) WHERE processo_id IS NOT NULL
    DO UPDATE SET papel = EXCLUDED.papel, compoe_renda = EXCLUDED.compoe_renda, ordem = EXCLUDED.ordem
    WHERE (participacoes.papel, participacoes.compoe_renda, participacoes.ordem)
          IS DISTINCT FROM (EXCLUDED.papel, EXCLUDED.compoe_renda, EXCLUDED.ordem);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION pv2_tem_renda(p_pessoa_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(renda_formal, 0) + coalesce(renda_informal, 0) > 0 FROM pessoas WHERE id = p_pessoa_id AND deleted_at IS NULL;
$$;

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

-- ============================================================
-- Permissions: funções só acessíveis via service_role (backfill, triggers)
-- ============================================================

REVOKE ALL ON FUNCTION pv2_pessoa_de_campos_soltos(uuid, text, text, date, text, numeric, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION pv2_pessoa_de_campos_soltos(uuid, text, text, date, text, numeric, numeric) TO service_role;

REVOKE ALL ON FUNCTION pv2_garantir_relacionamento(uuid, uuid, uuid, text, text, date, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION pv2_garantir_relacionamento(uuid, uuid, uuid, text, text, date, boolean) TO service_role;

REVOKE ALL ON FUNCTION pv2_ex_conjuge(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION pv2_ex_conjuge(uuid, text, text) TO service_role;

REVOKE ALL ON FUNCTION pv2_sincronizar_relacionamento_pessoa(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION pv2_sincronizar_relacionamento_pessoa(uuid) TO service_role;

REVOKE ALL ON FUNCTION pv2_gravar_participacoes(uuid, uuid, uuid, uuid[], text[], boolean[], int[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION pv2_gravar_participacoes(uuid, uuid, uuid, uuid[], text[], boolean[], int[]) TO service_role;

REVOKE ALL ON FUNCTION pv2_tem_renda(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION pv2_tem_renda(uuid) TO service_role;

REVOKE ALL ON FUNCTION pv2_sincronizar_lead(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION pv2_sincronizar_lead(uuid) TO service_role;

REVOKE ALL ON FUNCTION pv2_sincronizar_processo(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION pv2_sincronizar_processo(uuid) TO service_role;
