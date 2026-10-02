-- ============================================================
-- 335 — Participantes V2: cônjuge do comprador principal entra sozinho no NEGÓCIO
-- (decisão 02/10/2026: "automático, como no lead").
--
-- Antes: no negócio só o cônjuge do VENDEDOR era derivado do casamento; o do comprador só entrava
-- se incluído à mão na aba Compradores. Negócio criado direto em Negócios (sem vir de lead) ficava
-- sem o cônjuge (achado com #proc-T03 no staging). Agora pv2_sincronizar_processo deriva o cônjuge
-- (casamento vigente) do titular como conjuge_anuente, compõe renda se tiver renda — mesma regra
-- de pv2_sincronizar_lead. Função gerada a partir da última definição (migration 333) + o bloco novo.
--
-- Ressincroniza todos os negócios ativos no fim (só ACRESCENTA o cônjuge onde faltava).
-- Rodar ANTES: supabase/2026-10-08_diagnostico_335.sql (mostra o que muda, sem gravar).
-- Rodar primeiro no STAGING, depois na produção no momento do merge.
-- ============================================================

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

  -- 335: cônjuge do TITULAR entra sozinho como conjuge_anuente (casamento VIGENTE), igual ao lead e ao
  -- cônjuge do vendedor — antes só entrava se incluído à mão (negócio criado direto em Negócios ficava sem).
  -- Fora: cônjuge já no negócio (comprador/vendedor), excluído, de outra empresa ou de operador.
  -- Para tirar: encerrar o casamento (nunca é recriado implicitamente).
  v_conj := NULL;
  IF v_titular IS NOT NULL THEN
    SELECT CASE WHEN rel.pessoa_a_id = v_titular THEN rel.pessoa_b_id ELSE rel.pessoa_a_id END INTO v_conj
    FROM pessoa_relacionamentos rel
    JOIN pessoas px ON px.id = (CASE WHEN rel.pessoa_a_id = v_titular THEN rel.pessoa_b_id ELSE rel.pessoa_a_id END)
    WHERE rel.data_fim IS NULL AND v_titular IN (rel.pessoa_a_id, rel.pessoa_b_id)
      AND px.deleted_at IS NULL AND px.empresa_id = pr.empresa_id
    LIMIT 1;
    IF v_conj IS NOT NULL AND NOT v_conj = ANY(v_compradores) AND NOT v_conj = ANY(v_vendedores)
       AND NOT pessoa_e_de_operador(v_conj) THEN
      v_pessoas := v_pessoas || v_conj; v_papeis := v_papeis || 'conjuge_anuente'::text;
      v_renda := v_renda || coalesce(pv2_tem_renda(v_conj), false); v_ordens := v_ordens || 2;
      i := 3;
    END IF;
  END IF;
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

REVOKE ALL ON FUNCTION pv2_sincronizar_processo(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION pv2_sincronizar_processo(uuid) TO service_role;

-- Ressincroniza os negócios ativos (o cônjuge entra onde faltava; nada é removido).
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM processos WHERE deleted_at IS NULL LOOP
    PERFORM pv2_sincronizar_processo(r.id);
  END LOOP;
END $$;
