-- Rodar no SQL Editor. Tudo é desfeito no ROLLBACK. Qualquer RAISE EXCEPTION = teste falhou.
BEGIN;
DO $$
DECLARE
  v_emp uuid; v_fase uuid; v_origem lead_origem;
  v_p1 uuid; v_p2 uuid; v_p3 uuid; v_p4 uuid; v_p5 uuid; v_lead uuid; v_ok boolean;
BEGIN
  SELECT id INTO v_emp FROM empresas LIMIT 1;
  SELECT id INTO v_fase FROM fases WHERE empresa_id = v_emp LIMIT 1;
  SELECT origem INTO v_origem FROM leads LIMIT 1;
  INSERT INTO pessoas (empresa_id, nome) VALUES (v_emp, 'PV2 TESTE A') RETURNING id INTO v_p1;
  INSERT INTO pessoas (empresa_id, nome) VALUES (v_emp, 'PV2 TESTE B') RETURNING id INTO v_p2;
  INSERT INTO pessoas (empresa_id, nome) VALUES (v_emp, 'PV2 TESTE C') RETURNING id INTO v_p3;
  INSERT INTO pessoas (empresa_id, nome) VALUES (v_emp, 'PV2 TESTE D') RETURNING id INTO v_p4;
  INSERT INTO pessoas (empresa_id, nome) VALUES (v_emp, 'PV2 TESTE E') RETURNING id INTO v_p5;
  INSERT INTO leads (empresa_id, nome, telefone, fase_id, origem)
    VALUES (v_emp, 'PV2 LEAD', '5544900000000', v_fase, v_origem) RETURNING id INTO v_lead;

  -- cpf_valido
  IF NOT cpf_valido('529.982.247-25') THEN RAISE EXCEPTION 'cpf válido recusado'; END IF;
  IF cpf_valido('44984558945') THEN RAISE EXCEPTION 'telefone aceito como CPF'; END IF;
  IF cpf_valido('11111111111') THEN RAISE EXCEPTION 'CPF repetido aceito'; END IF;

  -- titular único por lead
  INSERT INTO participacoes (empresa_id, lead_id, pessoa_id, papel, compoe_renda, ordem) VALUES (v_emp, v_lead, v_p1, 'titular', true, 1);
  BEGIN
    INSERT INTO participacoes (empresa_id, lead_id, pessoa_id, papel, compoe_renda, ordem) VALUES (v_emp, v_lead, v_p2, 'titular', true, 1);
    RAISE EXCEPTION 'dois titulares aceitos';
  EXCEPTION WHEN unique_violation THEN NULL; END;

  -- mesma pessoa duas vezes no mesmo lead
  BEGIN
    INSERT INTO participacoes (empresa_id, lead_id, pessoa_id, papel, compoe_renda, ordem) VALUES (v_emp, v_lead, v_p1, 'coparticipante', true, 2);
    RAISE EXCEPTION 'pessoa duplicada aceita';
  EXCEPTION WHEN unique_violation THEN NULL; END;

  -- lead e processo ao mesmo tempo / nenhum dos dois
  BEGIN
    INSERT INTO participacoes (empresa_id, pessoa_id, papel, compoe_renda, ordem) VALUES (v_emp, v_p2, 'coparticipante', true, 2);
    RAISE EXCEPTION 'participação sem alvo aceita';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- papel inválido
  BEGIN
    INSERT INTO participacoes (empresa_id, lead_id, pessoa_id, papel, compoe_renda, ordem) VALUES (v_emp, v_lead, v_p2, 'fiador', true, 2);
    RAISE EXCEPTION 'papel inválido aceito';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- relacionamento: par ordenado e um vigente por pessoa
  INSERT INTO pessoa_relacionamentos (empresa_id, pessoa_a_id, pessoa_b_id, tipo)
    VALUES (v_emp, least(v_p1, v_p2), greatest(v_p1, v_p2), 'casamento');
  BEGIN
    INSERT INTO pessoa_relacionamentos (empresa_id, pessoa_a_id, pessoa_b_id, tipo)
      VALUES (v_emp, least(v_p1, v_p3), greatest(v_p1, v_p3), 'casamento');
    RAISE EXCEPTION 'segundo casamento vigente aceito';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN
    INSERT INTO pessoa_relacionamentos (empresa_id, pessoa_a_id, pessoa_b_id, tipo)
      VALUES (v_emp, greatest(v_p4, v_p5), least(v_p4, v_p5), 'casamento');
    RAISE EXCEPTION 'par fora de ordem aceito';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- guard de operador: pessoa com telefone de usuário interno ativo
  SELECT EXISTS (SELECT 1 FROM usuarios WHERE empresa_id = v_emp AND ativo AND coalesce(telefone_whatsapp, telefone) IS NOT NULL) INTO v_ok;
  IF v_ok THEN
    INSERT INTO pessoa_telefones (pessoa_id, empresa_id, telefone)
      SELECT v_p3, v_emp, coalesce(telefone_whatsapp, telefone) FROM usuarios
      WHERE empresa_id = v_emp AND ativo AND coalesce(telefone_whatsapp, telefone) IS NOT NULL LIMIT 1;
    IF NOT pessoa_e_de_operador(v_p3) THEN RAISE EXCEPTION 'operador não detectado'; END IF;
    BEGIN
      INSERT INTO participacoes (empresa_id, lead_id, pessoa_id, papel, compoe_renda, ordem) VALUES (v_emp, v_lead, v_p3, 'coparticipante', true, 3);
      RAISE EXCEPTION 'pessoa de operador aceita como participante';
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM <> 'pessoa_de_operador' THEN RAISE; END IF;
    END;
  END IF;
  IF pessoa_e_de_operador(v_p1) THEN RAISE EXCEPTION 'pessoa comum marcada como operador'; END IF;

  -- soft-deleted pessoa não pode ser participante
  UPDATE pessoas SET deleted_at = now() WHERE id = v_p2;
  BEGIN
    INSERT INTO participacoes (empresa_id, lead_id, pessoa_id, papel, compoe_renda, ordem) VALUES (v_emp, v_lead, v_p2, 'coparticipante', true, 4);
    RAISE EXCEPTION 'pessoa excluída aceita como participante';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'pessoa_de_outra_empresa_ou_excluida' THEN RAISE; END IF;
  END;

  RAISE NOTICE 'OK: integridade participantes v2';
END $$;
ROLLBACK;
