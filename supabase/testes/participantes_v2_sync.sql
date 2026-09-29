BEGIN;
DO $$
DECLARE
  v_emp uuid; v_fase uuid; v_origem lead_origem; v_modal modalidade_processo;
  v_heitor uuid; v_afranio uuid; v_lead uuid; v_proc uuid; v_maria uuid; v_x uuid; n int; r record;
BEGIN
  SELECT id INTO v_emp FROM empresas LIMIT 1;
  SELECT id INTO v_fase FROM fases WHERE empresa_id = v_emp LIMIT 1;
  SELECT origem INTO v_origem FROM leads LIMIT 1;
  SELECT modalidade INTO v_modal FROM processos LIMIT 1;

  -- Cenário real: Heitor (titular) + Afrânio (coparticipante, casado com Maria só em campos soltos)
  INSERT INTO pessoas (empresa_id, nome, estado_civil) VALUES (v_emp, 'PV2 HEITOR', 'solteiro') RETURNING id INTO v_heitor;
  INSERT INTO pessoas (empresa_id, nome, estado_civil, regime_casamento, data_casamento, conjuge_nome, conjuge_cpf)
    VALUES (v_emp, 'PV2 AFRANIO', 'casado', 'comunhao_parcial', '1990-05-01', 'PV2 MARIA', '44984558945') -- CPF inválido (telefone)
    RETURNING id INTO v_afranio;
  INSERT INTO leads (empresa_id, nome, telefone, fase_id, origem, pessoa_id, renda_formal)
    VALUES (v_emp, 'PV2 HEITOR', '5544900000002', v_fase, v_origem, v_heitor, 5000) RETURNING id INTO v_lead;
  INSERT INTO lead_coparticipantes (empresa_id, lead_id, pessoa_id) VALUES (v_emp, v_lead, v_afranio);

  PERFORM pv2_sincronizar_relacionamento_pessoa(v_afranio);
  SELECT conjuge_pessoa_id INTO v_maria FROM pessoas WHERE id = v_afranio;
  IF v_maria IS NULL THEN RAISE EXCEPTION 'cônjuge solto não virou Pessoa'; END IF;
  IF (SELECT cpf FROM pessoas WHERE id = v_maria) IS NOT NULL THEN RAISE EXCEPTION 'telefone gravado como CPF'; END IF;
  SELECT * INTO r FROM pessoa_relacionamentos WHERE data_fim IS NULL AND v_afranio IN (pessoa_a_id, pessoa_b_id);
  IF r.regime_bens <> 'comunhao_parcial' OR r.data_inicio <> '1990-05-01' OR r.tipo <> 'casamento' THEN
    RAISE EXCEPTION 'relacionamento sem regime/data/tipo: %', row_to_json(r);
  END IF;

  PERFORM pv2_sincronizar_lead(v_lead);
  PERFORM pv2_sincronizar_lead(v_lead); -- idempotente
  SELECT count(*) INTO n FROM participacoes WHERE lead_id = v_lead;
  IF n <> 2 THEN RAISE EXCEPTION 'esperava 2 participações, veio %', n; END IF;
  IF NOT EXISTS (SELECT 1 FROM participacoes WHERE lead_id = v_lead AND pessoa_id = v_heitor AND papel = 'titular' AND compoe_renda) THEN RAISE EXCEPTION 'titular errado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM participacoes WHERE lead_id = v_lead AND pessoa_id = v_afranio AND papel = 'coparticipante' AND compoe_renda) THEN RAISE EXCEPTION 'coparticipante errado'; END IF;
  IF (SELECT renda_formal FROM pessoas WHERE id = v_heitor) IS NOT NULL THEN
    RAISE NOTICE 'renda do titular já existia na pessoa (ok)';
  END IF;

  -- Titular trocado: Afrânio vira titular, Heitor sai de coparticipante? Não: Heitor some da fonte antiga.
  UPDATE leads SET pessoa_id = v_afranio WHERE id = v_lead;
  DELETE FROM lead_coparticipantes WHERE lead_id = v_lead;
  INSERT INTO lead_coparticipantes (empresa_id, lead_id, pessoa_id) VALUES (v_emp, v_lead, v_heitor);
  PERFORM pv2_sincronizar_lead(v_lead);
  IF NOT EXISTS (SELECT 1 FROM participacoes WHERE lead_id = v_lead AND pessoa_id = v_afranio AND papel = 'titular') THEN RAISE EXCEPTION 'troca de titular falhou'; END IF;
  IF NOT EXISTS (SELECT 1 FROM participacoes WHERE lead_id = v_lead AND pessoa_id = v_heitor AND papel = 'coparticipante') THEN RAISE EXCEPTION 'ex-titular não virou coparticipante'; END IF;
  -- Maria entra como cônjuge anuente do titular (vem de pessoas.conjuge_pessoa_id do Afrânio)
  IF NOT EXISTS (SELECT 1 FROM participacoes WHERE lead_id = v_lead AND pessoa_id = v_maria AND papel = 'conjuge_anuente' AND NOT compoe_renda) THEN RAISE EXCEPTION 'cônjuge do titular faltando'; END IF;

  -- Mesma pessoa em duas listas: Maria também como coparticipante → uma linha só, papel cônjuge
  INSERT INTO lead_coparticipantes (empresa_id, lead_id, pessoa_id) VALUES (v_emp, v_lead, v_maria);
  PERFORM pv2_sincronizar_lead(v_lead);
  SELECT count(*) INTO n FROM participacoes WHERE lead_id = v_lead AND pessoa_id = v_maria;
  IF n <> 1 THEN RAISE EXCEPTION 'pessoa duplicada'; END IF;

  -- Processo: comprador sem pessoa_id com CPF de pessoa existente → reaproveita
  UPDATE pessoas SET cpf = '529.982.247-25' WHERE id = v_heitor;
  INSERT INTO processos (empresa_id, numero_processo, nome_imovel, modalidade, lead_id)
    VALUES (v_emp, 'PV2-TESTE', 'PV2 IMOVEL', v_modal, v_lead) RETURNING id INTO v_proc;
  INSERT INTO processo_compradores (empresa_id, processo_id, nome, principal, pessoa_id) VALUES (v_emp, v_proc, 'PV2 AFRANIO', true, v_afranio);
  INSERT INTO processo_compradores (empresa_id, processo_id, nome, cpf, principal) VALUES (v_emp, v_proc, 'Heitor digitado', '52998224725', false);
  INSERT INTO processo_compradores (empresa_id, processo_id, nome, principal, pessoa_id) VALUES (v_emp, v_proc, 'PV2 MARIA', false, v_maria);
  INSERT INTO processo_vendedores (empresa_id, processo_id, nome, cpf, conjuge_nome, conjuge_papel, banco)
    VALUES (v_emp, v_proc, 'PV2 VENDEDOR', NULL, 'PV2 VENDEDORA', 'proprietario', '001');
  PERFORM pv2_sincronizar_processo(v_proc);
  IF (SELECT pessoa_id FROM processo_compradores WHERE processo_id = v_proc AND nome = 'Heitor digitado') <> v_heitor THEN RAISE EXCEPTION 'CPF existente não reaproveitado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM participacoes WHERE processo_id = v_proc AND pessoa_id = v_afranio AND papel = 'titular') THEN RAISE EXCEPTION 'titular do processo'; END IF;
  IF NOT EXISTS (SELECT 1 FROM participacoes WHERE processo_id = v_proc AND pessoa_id = v_maria AND papel = 'conjuge_anuente') THEN RAISE EXCEPTION 'cônjuge do processo'; END IF;
  IF NOT EXISTS (SELECT 1 FROM participacoes WHERE processo_id = v_proc AND pessoa_id = v_heitor AND papel = 'coparticipante') THEN RAISE EXCEPTION 'coparticipante do processo'; END IF;
  SELECT count(*) INTO n FROM participacoes WHERE processo_id = v_proc AND papel = 'vendedor';
  IF n <> 2 THEN RAISE EXCEPTION 'vendedor + cônjuge proprietária deviam ser 2 vendedores, veio %', n; END IF;
  SELECT pessoa_id INTO v_x FROM processo_vendedores WHERE processo_id = v_proc;
  IF (SELECT conta_bancaria_banco FROM pessoas WHERE id = v_x) <> '001' THEN RAISE EXCEPTION 'banco do vendedor não foi pra Pessoa'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pessoa_relacionamentos WHERE data_fim IS NULL AND v_x IN (pessoa_a_id, pessoa_b_id)) THEN RAISE EXCEPTION 'casal vendedor sem relacionamento'; END IF;

  -- Titular pessoa soft-deleted: sync sem erro, 0 participações para essa pessoa
  INSERT INTO pessoas (empresa_id, nome, estado_civil) VALUES (v_emp, 'PV2 DELETADO', 'solteiro') RETURNING id INTO v_x;
  INSERT INTO leads (empresa_id, nome, telefone, fase_id, origem, pessoa_id)
    VALUES (v_emp, 'PV2 DELETADO LEAD', '5544900000003', v_fase, v_origem, v_x) RETURNING id INTO v_lead;
  UPDATE pessoas SET deleted_at = now() WHERE id = v_x;
  PERFORM pv2_sincronizar_lead(v_lead);
  IF (SELECT count(*) FROM participacoes WHERE lead_id = v_lead AND pessoa_id = v_x) <> 0 THEN RAISE EXCEPTION 'pessoa soft-deleted não deveria gerar participação'; END IF;

  RAISE NOTICE 'OK: sync participantes v2';
END $$;
ROLLBACK;
