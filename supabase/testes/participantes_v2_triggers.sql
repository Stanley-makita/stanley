BEGIN;
DO $$
DECLARE
  v_emp uuid; v_fase uuid; v_origem lead_origem; v_modal modalidade_processo;
  v_a uuid; v_b uuid; v_c uuid; v_lead uuid; v_proc uuid; n int;
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

  RAISE NOTICE 'OK: triggers participantes v2';
END $$;
ROLLBACK;
