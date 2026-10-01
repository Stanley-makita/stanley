-- Teste da migration 332 (merge_pessoas). Rodar no SQL Editor DEPOIS da 332.
-- Tudo é desfeito no ROLLBACK. Qualquer RAISE EXCEPTION = teste falhou; sem erro = passou.
BEGIN;
DO $$
DECLARE
  v_emp uuid; v_fase uuid; v_origem lead_origem; v_modal modalidade_processo;
  v_a uuid; v_b uuid; v_c uuid; v_d uuid; v_e uuid; v_f uuid; v_lead uuid; v_lead2 uuid; v_proc uuid;
  n int; v_txt text;
BEGIN
  SELECT id INTO v_emp FROM empresas LIMIT 1;
  SELECT id INTO v_fase FROM fases WHERE empresa_id = v_emp LIMIT 1;
  SELECT origem INTO v_origem FROM leads LIMIT 1;
  SELECT modalidade INTO v_modal FROM processos LIMIT 1;

  -- A = "Heitor" sem CPF (cadastro duplicado, fica); B = "Heitor S" completo (some na merge).
  -- B é titular de um lead com C de coparticipante, casado com D, comprador de um negócio onde A também está.
  INSERT INTO pessoas (empresa_id, nome, estado_civil) VALUES (v_emp, 'PV2M HEITOR', 'solteiro') RETURNING id INTO v_a;
  INSERT INTO pessoas (empresa_id, nome, cpf, email, estado_civil) VALUES (v_emp, 'PV2M HEITOR S', '52998224725', 'h@x.com', 'casado') RETURNING id INTO v_b;
  INSERT INTO pessoas (empresa_id, nome) VALUES (v_emp, 'PV2M AFRANIO') RETURNING id INTO v_c;
  INSERT INTO pessoas (empresa_id, nome, estado_civil) VALUES (v_emp, 'PV2M MARIA', 'casado') RETURNING id INTO v_d;
  UPDATE pessoas SET conjuge_pessoa_id = v_d WHERE id = v_b;
  UPDATE pessoas SET conjuge_pessoa_id = v_b WHERE id = v_d;
  INSERT INTO pessoa_telefones (empresa_id, pessoa_id, telefone, principal, whatsapp, ativo) VALUES (v_emp, v_a, '5500900000001', true, true, true);
  INSERT INTO pessoa_telefones (empresa_id, pessoa_id, telefone, principal, whatsapp, ativo) VALUES (v_emp, v_b, '5500900000002', true, true, true);
  -- histórico na secundária (pessoas_alteracoes é ON DELETE RESTRICT — era o que travava a rota antiga)
  INSERT INTO pessoas_alteracoes (pessoa_id, empresa_id, campos_alterados, valores_anteriores, valores_novos, origem)
    VALUES (v_b, v_emp, ARRAY['email'], '{}', '{"email":"h@x.com"}', 'pessoas');
  INSERT INTO leads (empresa_id, nome, telefone, fase_id, origem, pessoa_id)
    VALUES (v_emp, 'PV2M LEAD', '5500900000002', v_fase, v_origem, v_b) RETURNING id INTO v_lead;
  INSERT INTO lead_coparticipantes (empresa_id, lead_id, pessoa_id) VALUES (v_emp, v_lead, v_c);
  INSERT INTO processos (empresa_id, numero_processo, nome_imovel, modalidade, lead_id)
    VALUES (v_emp, 'PV2M-TESTE', 'PV2M IMOVEL', v_modal, v_lead) RETURNING id INTO v_proc;
  INSERT INTO processo_compradores (empresa_id, processo_id, nome, principal, pessoa_id) VALUES (v_emp, v_proc, 'PV2M HEITOR S', true, v_b);
  INSERT INTO processo_compradores (empresa_id, processo_id, nome, principal, pessoa_id) VALUES (v_emp, v_proc, 'PV2M HEITOR', false, v_a);

  PERFORM merge_pessoas(v_a, v_b, v_emp, NULL);

  IF EXISTS (SELECT 1 FROM pessoas WHERE id = v_b) THEN RAISE EXCEPTION 'secundária não foi apagada'; END IF;
  SELECT cpf || '|' || email || '|' || nome INTO v_txt FROM pessoas WHERE id = v_a;
  IF v_txt IS DISTINCT FROM '52998224725|h@x.com|PV2M HEITOR' THEN RAISE EXCEPTION 'dados não preenchidos/nome trocado: %', v_txt; END IF;
  SELECT count(*) INTO n FROM pessoa_telefones WHERE pessoa_id = v_a;
  IF n <> 2 THEN RAISE EXCEPTION 'telefones: esperado 2, veio %', n; END IF;
  SELECT count(*) INTO n FROM pessoa_telefones WHERE pessoa_id = v_a AND principal;
  IF n <> 1 THEN RAISE EXCEPTION 'telefone principal: esperado 1, veio %', n; END IF;
  SELECT count(*) INTO n FROM pessoas_alteracoes WHERE pessoa_id = v_a;
  IF n <> 2 THEN RAISE EXCEPTION 'histórico: esperado 2 (movido + merge), veio %', n; END IF;
  IF (SELECT pessoa_id FROM leads WHERE id = v_lead) <> v_a THEN RAISE EXCEPTION 'lead não passou para a principal'; END IF;
  IF NOT EXISTS (SELECT 1 FROM participacoes WHERE lead_id = v_lead AND pessoa_id = v_a AND papel = 'titular') THEN
    RAISE EXCEPTION 'participação titular não está na principal'; END IF;
  IF NOT EXISTS (SELECT 1 FROM participacoes WHERE lead_id = v_lead AND pessoa_id = v_c AND papel = 'coparticipante') THEN
    RAISE EXCEPTION 'coparticipante sumiu'; END IF;
  IF (SELECT conjuge_pessoa_id FROM pessoas WHERE id = v_a) IS DISTINCT FROM v_d THEN RAISE EXCEPTION 'cônjuge não passou para a principal'; END IF;
  IF (SELECT conjuge_pessoa_id FROM pessoas WHERE id = v_d) IS DISTINCT FROM v_a THEN RAISE EXCEPTION 'ponteiro do cônjuge não aponta para a principal'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pessoa_relacionamentos WHERE pessoa_a_id = least(v_a, v_d) AND pessoa_b_id = greatest(v_a, v_d) AND data_fim IS NULL) THEN
    RAISE EXCEPTION 'casamento vigente A–D não existe'; END IF;
  SELECT count(*) INTO n FROM processo_compradores WHERE processo_id = v_proc;
  IF n <> 1 THEN RAISE EXCEPTION 'compradores do negócio: esperado 1 (sem duplicar a principal), veio %', n; END IF;
  IF NOT (SELECT principal FROM processo_compradores WHERE processo_id = v_proc) THEN RAISE EXCEPTION 'comprador que ficou perdeu o principal'; END IF;
  SELECT count(*) INTO n FROM participacoes WHERE processo_id = v_proc AND pessoa_id = v_a;
  IF n <> 1 THEN RAISE EXCEPTION 'participação no negócio: esperado 1, veio %', n; END IF;

  -- Conflito: cada uma casada com uma pessoa diferente → recusa, nada gravado
  INSERT INTO pessoas (empresa_id, nome, estado_civil) VALUES (v_emp, 'PV2M E', 'casado') RETURNING id INTO v_e;
  INSERT INTO pessoas (empresa_id, nome, estado_civil) VALUES (v_emp, 'PV2M F', 'casado') RETURNING id INTO v_f;
  UPDATE pessoas SET conjuge_pessoa_id = v_f WHERE id = v_e;
  UPDATE pessoas SET conjuge_pessoa_id = v_e WHERE id = v_f;
  BEGIN
    PERFORM merge_pessoas(v_a, v_e, v_emp, NULL);
    RAISE EXCEPTION 'merge com cônjuges diferentes aceita';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%merge_conjuges_diferentes%' THEN RAISE; END IF;
  END;

  -- Conflito: as duas com lead aberto → recusa
  INSERT INTO pessoas (empresa_id, nome) VALUES (v_emp, 'PV2M G') RETURNING id INTO v_c;
  INSERT INTO leads (empresa_id, nome, telefone, fase_id, origem, pessoa_id)
    VALUES (v_emp, 'PV2M LEAD2', '5500900000003', v_fase, v_origem, v_c) RETURNING id INTO v_lead2;
  BEGIN
    PERFORM merge_pessoas(v_a, v_c, v_emp, NULL);
    RAISE EXCEPTION 'merge com dois leads abertos aceita';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%merge_dois_leads_abertos%' THEN RAISE; END IF;
  END;
  IF NOT EXISTS (SELECT 1 FROM pessoas WHERE id = v_c) THEN RAISE EXCEPTION 'merge recusada apagou a secundária'; END IF;

  -- Mesma pessoa / outra empresa
  BEGIN
    PERFORM merge_pessoas(v_a, v_a, v_emp, NULL);
    RAISE EXCEPTION 'merge consigo mesma aceita';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%merge_invalido%' THEN RAISE; END IF;
  END;

  RAISE NOTICE 'merge_pessoas: todos os testes passaram';
END $$;
ROLLBACK;
