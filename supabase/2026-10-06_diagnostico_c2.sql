-- Diagnóstico da virada (C2) — rodar LOGO DEPOIS da migration 333.
-- Ressincroniza todos os leads/negócios com a regra nova e mostra o que MUDARIA nas participações.
-- NADA É GRAVADO: o bloco termina com um ERRO de propósito, cujo texto é o relatório (o erro desfaz tudo).
-- Esperado: poucas mudanças, quase todas "+ conjuge_vendedor" (no negócio, o cônjuge do vendedor agora vem
-- do casamento registrado; antes vinha dos campos soltos da linha do vendedor) e as 3 conferências em 0.
-- Muitas linhas "- sai" em compradores = parar e me mandar o texto.
DO $$
DECLARE r record; v_txt text := ''; v_det text := ''; n int;
BEGIN
  CREATE TEMP TABLE pv2_antes ON COMMIT DROP AS
  SELECT coalesce(lead_id, processo_id) AS proposta, CASE WHEN lead_id IS NOT NULL THEN 'lead' ELSE 'negocio' END AS tipo,
         pessoa_id, papel, compoe_renda FROM participacoes;

  FOR r IN SELECT id FROM leads WHERE deleted_at IS NULL LOOP PERFORM pv2_sincronizar_lead(r.id); END LOOP;
  FOR r IN SELECT id FROM processos WHERE deleted_at IS NULL LOOP PERFORM pv2_sincronizar_processo(r.id); END LOOP;

  CREATE TEMP TABLE pv2_depois ON COMMIT DROP AS
  SELECT coalesce(lead_id, processo_id) AS proposta, CASE WHEN lead_id IS NOT NULL THEN 'lead' ELSE 'negocio' END AS tipo,
         pessoa_id, papel, compoe_renda FROM participacoes;

  CREATE TEMP TABLE pv2_mudancas ON COMMIT DROP AS
  SELECT d.tipo, '+ entra ' || d.papel AS mudanca, d.pessoa_id, d.proposta FROM pv2_depois d
    WHERE NOT EXISTS (SELECT 1 FROM pv2_antes a WHERE a.proposta = d.proposta AND a.pessoa_id = d.pessoa_id)
  UNION ALL
  SELECT a.tipo, '- sai ' || a.papel, a.pessoa_id, a.proposta FROM pv2_antes a
    WHERE NOT EXISTS (SELECT 1 FROM pv2_depois d WHERE d.proposta = a.proposta AND d.pessoa_id = a.pessoa_id)
  UNION ALL
  SELECT d.tipo, '~ papel ' || a.papel || ' -> ' || d.papel, d.pessoa_id, d.proposta FROM pv2_depois d
    JOIN pv2_antes a ON a.proposta = d.proposta AND a.pessoa_id = d.pessoa_id WHERE a.papel <> d.papel
  UNION ALL
  SELECT d.tipo, '~ compoe_renda ' || a.compoe_renda || ' -> ' || d.compoe_renda || ' (' || d.papel || ')', d.pessoa_id, d.proposta
    FROM pv2_depois d JOIN pv2_antes a ON a.proposta = d.proposta AND a.pessoa_id = d.pessoa_id
    WHERE a.papel = d.papel AND a.compoe_renda <> d.compoe_renda;

  FOR r IN SELECT tipo, mudanca, count(*) AS q FROM pv2_mudancas GROUP BY 1, 2 ORDER BY 1, 2 LOOP
    v_txt := v_txt || E'\n  ' || r.tipo || ' | ' || r.mudanca || ' | ' || r.q;
  END LOOP;
  IF v_txt = '' THEN v_txt := E'\n  (nenhuma mudança)'; END IF;

  FOR r IN SELECT m.tipo, m.mudanca, p.nome, coalesce(l.nome, pr.numero_processo, '?') AS prop
           FROM pv2_mudancas m JOIN pessoas p ON p.id = m.pessoa_id
           LEFT JOIN leads l ON l.id = m.proposta LEFT JOIN processos pr ON pr.id = m.proposta
           ORDER BY m.tipo, m.mudanca LIMIT 40 LOOP
    v_det := v_det || E'\n  ' || r.tipo || ' ' || r.prop || ': ' || r.nome || ' (' || r.mudanca || ')';
  END LOOP;

  SELECT count(*) INTO n FROM leads l WHERE l.deleted_at IS NULL AND l.pessoa_id IS NOT NULL
    AND NOT pessoa_e_de_operador(l.pessoa_id)
    AND EXISTS (SELECT 1 FROM pessoas p WHERE p.id = l.pessoa_id AND p.deleted_at IS NULL)
    AND NOT EXISTS (SELECT 1 FROM participacoes pa WHERE pa.lead_id = l.id AND pa.papel = 'titular');
  v_txt := v_txt || E'\n\nCONFERENCIAS (todas devem ser 0):\n  lead aberto sem titular: ' || n;
  SELECT count(*) INTO n FROM processos pr WHERE pr.deleted_at IS NULL
    AND EXISTS (SELECT 1 FROM participacoes pa WHERE pa.processo_id = pr.id AND pa.papel IN ('coparticipante', 'conjuge_anuente'))
    AND NOT EXISTS (SELECT 1 FROM participacoes pa WHERE pa.processo_id = pr.id AND pa.papel = 'titular');
  v_txt := v_txt || E'\n  negocio com comprador e sem titular: ' || n;
  SELECT count(*) INTO n FROM participacoes WHERE pessoa_e_de_operador(pessoa_id);
  v_txt := v_txt || E'\n  participacao de operador: ' || n;

  RAISE EXCEPTION E'DIAGNOSTICO C2 (nada foi gravado)\n\nMUDANCAS (tipo | mudanca | quantas):%\n\nDETALHE (ate 40):%', v_txt, v_det;
END $$;
