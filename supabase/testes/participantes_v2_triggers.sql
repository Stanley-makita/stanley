BEGIN;
DO $$
DECLARE
  v_emp uuid; v_fase uuid; v_origem lead_origem; v_modal modalidade_processo;
  v_a uuid; v_b uuid; v_c uuid; v_lead uuid; v_proc uuid; n int;
  v_t uuid; v_c2 uuid; v_lead2 uuid;
BEGIN
  SELECT id INTO v_emp FROM empresas LIMIT 1;
  SELECT id INTO v_fase FROM fases WHERE empresa_id = v_emp LIMIT 1;
  SELECT origem INTO v_origem FROM leads LIMIT 1;
  SELECT modalidade INTO v_modal FROM processos LIMIT 1;
  INSERT INTO pessoas (empresa_id, nome) VALUES (v_emp, 'PV2T A') RETURNING id INTO v_a;
  INSERT INTO pessoas (empresa_id, nome) VALUES (v_emp, 'PV2T B') RETURNING id INTO v_b;
  INSERT INTO pessoas (empresa_id, nome) VALUES (v_emp, 'PV2T C') RETURNING id INTO v_c;

  -- lead novo com titular → participação criada pelo trigger
  INSERT INTO leads (empresa_id, nome, telefone, fase_id, origem, pessoa_id)
    VALUES (v_emp, 'PV2T', '5544900000003', v_fase, v_origem, v_a) RETURNING id INTO v_lead;
  IF NOT EXISTS (SELECT 1 FROM participacoes WHERE lead_id = v_lead AND pessoa_id = v_a AND papel = 'titular') THEN RAISE EXCEPTION 'insert de lead não sincronizou'; END IF;

  -- coparticipante adicionado/removido pela tabela antiga
  INSERT INTO lead_coparticipantes (empresa_id, lead_id, pessoa_id) VALUES (v_emp, v_lead, v_b);
  IF NOT EXISTS (SELECT 1 FROM participacoes WHERE lead_id = v_lead AND pessoa_id = v_b) THEN RAISE EXCEPTION 'coparticipante não sincronizou'; END IF;
  DELETE FROM lead_coparticipantes WHERE lead_id = v_lead AND pessoa_id = v_b;
  IF EXISTS (SELECT 1 FROM participacoes WHERE lead_id = v_lead AND pessoa_id = v_b) THEN RAISE EXCEPTION 'remoção não sincronizou'; END IF;

  -- renda editada no lead (aba Crédito antiga) vai para a Pessoa
  UPDATE leads SET renda_formal = 7777 WHERE id = v_lead;
  IF (SELECT renda_formal FROM pessoas WHERE id = v_a) IS DISTINCT FROM 7777 THEN RAISE EXCEPTION 'renda do lead não foi pra Pessoa'; END IF;

  -- casar A com C pela tela antiga (pessoas.conjuge_pessoa_id) → relacionamento + cônjuge no lead
  UPDATE pessoas SET estado_civil = 'casado', conjuge_pessoa_id = v_c, regime_casamento = 'separacao_total' WHERE id = v_a;
  IF NOT EXISTS (SELECT 1 FROM pessoa_relacionamentos WHERE data_fim IS NULL AND pessoa_a_id = least(v_a, v_c) AND pessoa_b_id = greatest(v_a, v_c) AND regime_bens = 'separacao_total') THEN RAISE EXCEPTION 'relacionamento não criado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM participacoes WHERE lead_id = v_lead AND pessoa_id = v_c AND papel = 'conjuge_anuente') THEN RAISE EXCEPTION 'cônjuge não entrou no lead'; END IF;

  -- editar regime_casamento pela tela antiga, mesmo cônjuge já vigente, tem que atualizar o
  -- relacionamento existente (pv2_garantir_relacionamento é fill-only e não sobrescreveria)
  UPDATE pessoas SET regime_casamento = 'comunhao_total' WHERE id = v_a;
  IF NOT EXISTS (SELECT 1 FROM pessoa_relacionamentos WHERE data_fim IS NULL AND pessoa_a_id = least(v_a, v_c) AND pessoa_b_id = greatest(v_a, v_c) AND regime_bens = 'comunhao_total') THEN RAISE EXCEPTION 'edição de regime não propagou pro relacionamento vigente'; END IF;

  -- renda do cônjuge editada no lead vai para a Pessoa do cônjuge
  UPDATE leads SET conjuge_renda_formal = 3000 WHERE id = v_lead;
  IF (SELECT renda_formal FROM pessoas WHERE id = v_c) IS DISTINCT FROM 3000 THEN RAISE EXCEPTION 'renda do cônjuge não foi pra Pessoa'; END IF;

  -- divórcio pela tela antiga encerra o relacionamento (não apaga)
  UPDATE pessoas SET estado_civil = 'divorciado', conjuge_pessoa_id = NULL WHERE id = v_a;
  IF EXISTS (SELECT 1 FROM pessoa_relacionamentos WHERE data_fim IS NULL AND v_a IN (pessoa_a_id, pessoa_b_id)) THEN RAISE EXCEPTION 'relacionamento não encerrado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pessoa_relacionamentos WHERE data_fim IS NOT NULL AND v_a IN (pessoa_a_id, pessoa_b_id)) THEN RAISE EXCEPTION 'histórico apagado'; END IF;
  IF EXISTS (SELECT 1 FROM participacoes WHERE lead_id = v_lead AND pessoa_id = v_c) THEN RAISE EXCEPTION 'ex-cônjuge continuou no lead'; END IF;
  IF (SELECT conjuge_pessoa_id FROM pessoas WHERE id = v_a) IS NOT NULL THEN RAISE EXCEPTION 'sync recasou a pessoa'; END IF;

  -- processo: comprador pela tabela antiga
  INSERT INTO processos (empresa_id, numero_processo, nome_imovel, modalidade) VALUES (v_emp, 'PV2T-1', 'PV2T', v_modal) RETURNING id INTO v_proc;
  INSERT INTO processo_compradores (empresa_id, processo_id, nome, principal, pessoa_id) VALUES (v_emp, v_proc, 'PV2T A', true, v_a);
  IF NOT EXISTS (SELECT 1 FROM participacoes WHERE processo_id = v_proc AND pessoa_id = v_a AND papel = 'titular') THEN RAISE EXCEPTION 'comprador não sincronizou'; END IF;

  -- merge de Pessoas: tabela antiga passa pra B, A é apagada → participação segue em B
  UPDATE processo_compradores SET pessoa_id = v_b WHERE processo_id = v_proc;
  UPDATE leads SET pessoa_id = v_b WHERE id = v_lead;
  DELETE FROM pessoas WHERE id = v_a;
  SELECT count(*) INTO n FROM participacoes WHERE (processo_id = v_proc OR lead_id = v_lead) AND pessoa_id = v_b AND papel = 'titular';
  IF n IS DISTINCT FROM 2 THEN RAISE EXCEPTION 'merge: titular não passou para B (%)', n; END IF;

  -- ══════════════════════════════════════════════════════════════════════════════════
  -- Fix round 1 — Critical #1: "Desvincular cônjuge" (rota antiga) nunca pode ser desfeito
  -- pela sync. Replay exato de src/app/api/leads/[id]/vincular-conjuge/route.ts:41-49 —
  -- lead → pessoa(C) → pessoa(T), nessa ordem.
  -- ══════════════════════════════════════════════════════════════════════════════════
  INSERT INTO pessoas (empresa_id, nome, estado_civil, cpf) VALUES (v_emp, 'PV2T T', 'casado', '11144477735') RETURNING id INTO v_t;
  INSERT INTO pessoas (empresa_id, nome, estado_civil, cpf) VALUES (v_emp, 'PV2T C2', 'casado', '48315297023') RETURNING id INTO v_c2;
  -- casar pela tela antiga (ponteiro nos dois lados) + lead do titular
  UPDATE pessoas SET conjuge_pessoa_id = v_c2 WHERE id = v_t;
  UPDATE pessoas SET conjuge_pessoa_id = v_t  WHERE id = v_c2;
  INSERT INTO leads (empresa_id, nome, telefone, fase_id, origem, pessoa_id)
    VALUES (v_emp, 'PV2T T LEAD', '5544900000004', v_fase, v_origem, v_t) RETURNING id INTO v_lead2;
  IF NOT EXISTS (SELECT 1 FROM pessoa_relacionamentos WHERE data_fim IS NULL AND pessoa_a_id = least(v_t, v_c2) AND pessoa_b_id = greatest(v_t, v_c2)) THEN RAISE EXCEPTION 'setup: casamento T/C2 não criou relacionamento'; END IF;
  IF NOT EXISTS (SELECT 1 FROM participacoes WHERE lead_id = v_lead2 AND pessoa_id = v_c2 AND papel = 'conjuge_anuente') THEN RAISE EXCEPTION 'setup: C2 não entrou no lead'; END IF;
  -- mimetiza o cache mantido por fn_sincronizar_pessoa_conjuge (migration 190) NOS DOIS LADOS
  -- (ele roda pra qualquer Pessoa que seja apontada por outra) — T guarda nome/cpf soltos de C2,
  -- C2 guarda nome/cpf soltos de T, e a rota de desvincular NUNCA limpa nenhum desses campos.
  -- O lead também ganha seus PRÓPRIOS campos soltos de cônjuge (nunca setados antes), pra
  -- exercitar o guard de pv2_ex_conjuge em pv2_sincronizar_lead, não só em
  -- pv2_sincronizar_relacionamento_pessoa.
  UPDATE pessoas SET conjuge_nome = 'PV2T C2', conjuge_cpf = '48315297023' WHERE id = v_t;
  UPDATE pessoas SET conjuge_nome = 'PV2T T',  conjuge_cpf = '11144477735' WHERE id = v_c2;
  UPDATE leads   SET conjuge_nome = 'PV2T C2', conjuge_cpf = '48315297023' WHERE id = v_lead2;

  UPDATE leads   SET conjuge_pessoa_id = NULL WHERE id = v_lead2;
  UPDATE pessoas SET conjuge_pessoa_id = NULL WHERE id = v_c2;
  UPDATE pessoas SET conjuge_pessoa_id = NULL WHERE id = v_t;

  IF EXISTS (SELECT 1 FROM pessoa_relacionamentos WHERE data_fim IS NULL AND v_t IN (pessoa_a_id, pessoa_b_id)) THEN RAISE EXCEPTION 'desvincular: relacionamento não encerrado'; END IF;
  IF EXISTS (SELECT 1 FROM participacoes WHERE lead_id = v_lead2 AND pessoa_id = v_c2) THEN RAISE EXCEPTION 'desvincular: C2 continuou como participante (critical bug reintroduzido, guards de campos soltos do lead e/ou da Pessoa C2 falharam)'; END IF;
  IF (SELECT conjuge_pessoa_id FROM leads WHERE id = v_lead2) IS NOT NULL THEN RAISE EXCEPTION 'desvincular: leads.conjuge_pessoa_id voltou'; END IF;
  IF (SELECT conjuge_pessoa_id FROM pessoas WHERE id = v_t) IS NOT NULL THEN RAISE EXCEPTION 'desvincular: pessoas(T).conjuge_pessoa_id voltou'; END IF;
  IF (SELECT conjuge_pessoa_id FROM pessoas WHERE id = v_c2) IS NOT NULL THEN RAISE EXCEPTION 'desvincular: pessoas(C2).conjuge_pessoa_id voltou'; END IF;
  SELECT count(*) INTO n FROM pessoas WHERE empresa_id = v_emp AND nome = 'PV2T C2';
  IF n IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'desvincular: pessoa fantasma de C2 criada (%), esperava 1', n; END IF;

  -- religar EXPLICITAMENTE (tela antiga aponta o ponteiro de novo) deve recriar o relacionamento
  UPDATE pessoas SET conjuge_pessoa_id = v_c2 WHERE id = v_t;
  IF NOT EXISTS (SELECT 1 FROM pessoa_relacionamentos WHERE data_fim IS NULL AND pessoa_a_id = least(v_t, v_c2) AND pessoa_b_id = greatest(v_t, v_c2)) THEN RAISE EXCEPTION 'religar explícito não recriou relacionamento'; END IF;

  -- ── Renda: colunas independentes (Important #2) ──
  UPDATE pessoas SET renda_informal = 500 WHERE id = v_t;
  UPDATE leads SET renda_formal = 1234 WHERE id = v_lead2;
  IF (SELECT renda_informal FROM pessoas WHERE id = v_t) IS DISTINCT FROM 500 THEN RAISE EXCEPTION 'renda_informal da pessoa foi sobrescrita por renda do lead'; END IF;
  IF (SELECT renda_formal FROM pessoas WHERE id = v_t) IS DISTINCT FROM 1234 THEN RAISE EXCEPTION 'renda_formal não propagou'; END IF;

  -- ── data_casamento propaga pro relacionamento vigente (Minor #6) ──
  UPDATE pessoas SET data_casamento = '2015-03-10' WHERE id = v_t;
  IF NOT EXISTS (SELECT 1 FROM pessoa_relacionamentos WHERE data_fim IS NULL AND pessoa_a_id = least(v_t, v_c2) AND pessoa_b_id = greatest(v_t, v_c2) AND data_inicio = '2015-03-10'::date) THEN RAISE EXCEPTION 'edição de data_casamento não propagou pro relacionamento'; END IF;

  -- ── compoe_renda reflete a renda ATUAL do cônjuge (Important #4) ──
  IF NOT EXISTS (SELECT 1 FROM participacoes WHERE lead_id = v_lead2 AND pessoa_id = v_c2 AND papel = 'conjuge_anuente' AND NOT compoe_renda) THEN RAISE EXCEPTION 'cônjuge sem renda deveria ter compoe_renda=false'; END IF;
  UPDATE pessoas SET renda_formal = 3000 WHERE id = v_c2;
  IF NOT EXISTS (SELECT 1 FROM participacoes WHERE lead_id = v_lead2 AND pessoa_id = v_c2 AND papel = 'conjuge_anuente' AND compoe_renda) THEN RAISE EXCEPTION 'cônjuge com renda nova não passou a compor renda'; END IF;

  RAISE NOTICE 'OK: triggers participantes v2';
END $$;
ROLLBACK;
