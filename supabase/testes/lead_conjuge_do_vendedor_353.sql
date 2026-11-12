-- Teste da migration 353 (cônjuge do vendedor também no LEAD). Rodar no SQL Editor DEPOIS da 353.
-- Tudo é desfeito no fim (o próprio bloco termina em erro de propósito).
-- Resultado esperado: erro "TESTE 353 OK — ..." com o resumo. Qualquer outro erro = teste falhou.
DO $$
DECLARE
  v_emp uuid; v_fase uuid;
  v_tit uuid; v_vend uuid; v_conj uuid; v_vend2 uuid; v_conj2 uuid; v_lead uuid;
  v_txt text; rel text := '';
BEGIN
  SELECT id INTO v_emp FROM empresas LIMIT 1;
  SELECT id INTO v_fase FROM fases WHERE empresa_id = v_emp LIMIT 1;

  INSERT INTO pessoas (empresa_id, nome, estado_civil) VALUES (v_emp, 'PV353 TITULAR', 'solteiro') RETURNING id INTO v_tit;
  INSERT INTO pessoas (empresa_id, nome, estado_civil) VALUES (v_emp, 'PV353 VENDEDOR', 'casado') RETURNING id INTO v_vend;
  INSERT INTO pessoas (empresa_id, nome, estado_civil) VALUES (v_emp, 'PV353 CONJUGE', 'casado') RETURNING id INTO v_conj;
  INSERT INTO pessoas (empresa_id, nome, estado_civil) VALUES (v_emp, 'PV353 VENDEDOR2', 'solteiro') RETURNING id INTO v_vend2;
  INSERT INTO pessoas (empresa_id, nome, estado_civil) VALUES (v_emp, 'PV353 CONJUGE2', 'solteiro') RETURNING id INTO v_conj2;
  UPDATE pessoas SET conjuge_pessoa_id = v_conj WHERE id = v_vend;
  UPDATE pessoas SET conjuge_pessoa_id = v_vend WHERE id = v_conj;

  INSERT INTO leads (empresa_id, nome, telefone, fase_id, origem, pessoa_id)
    VALUES (v_emp, 'PV353 LEAD', '5500900000353', v_fase, 'outros', v_tit) RETURNING id INTO v_lead;

  -- 1. Vendedor casado incluído no lead → cônjuge entra sozinho como conjuge_vendedor (derivado, não compõe renda)
  INSERT INTO participacoes (empresa_id, lead_id, pessoa_id, papel, compoe_renda, ordem, explicita)
    VALUES (v_emp, v_lead, v_vend, 'vendedor', false, 99, true);
  PERFORM pv2_sincronizar_lead(v_lead);
  SELECT string_agg(p.nome || ':' || pa.papel || ':' || pa.compoe_renda || ':' || pa.explicita, ',' ORDER BY pa.papel, p.nome) INTO v_txt
    FROM participacoes pa JOIN pessoas p ON p.id = pa.pessoa_id WHERE pa.lead_id = v_lead;
  IF v_txt IS DISTINCT FROM 'PV353 CONJUGE:conjuge_vendedor:false:false,PV353 TITULAR:titular:true:false,PV353 VENDEDOR:vendedor:false:true' THEN
    RAISE EXCEPTION '1. esperado titular + vendedor + cônjuge do vendedor derivado; veio: %', v_txt;
  END IF;
  rel := rel || '1 ok; ';

  -- 2. Casamento do vendedor registrado DEPOIS (como o OCR faz) → cônjuge aparece no lead pelo trigger, sem sync manual
  INSERT INTO participacoes (empresa_id, lead_id, pessoa_id, papel, compoe_renda, ordem, explicita)
    VALUES (v_emp, v_lead, v_vend2, 'vendedor', false, 99, true);
  PERFORM pv2_sincronizar_lead(v_lead);
  UPDATE pessoas SET conjuge_pessoa_id = v_conj2, estado_civil = 'casado' WHERE id = v_vend2;
  UPDATE pessoas SET conjuge_pessoa_id = v_vend2, estado_civil = 'casado' WHERE id = v_conj2;
  IF (SELECT papel FROM participacoes WHERE lead_id = v_lead AND pessoa_id = v_conj2) IS DISTINCT FROM 'conjuge_vendedor' THEN
    RAISE EXCEPTION '2. cônjuge do vendedor2 não apareceu no lead depois do casamento registrado';
  END IF;
  rel := rel || '2 ok; ';

  -- 3. Cônjuge que já participa da compra não vira cônjuge do vendedor (continua comprador)
  INSERT INTO participacoes (empresa_id, lead_id, pessoa_id, papel, compoe_renda, ordem, explicita)
    VALUES (v_emp, v_lead, v_conj, 'coparticipante', true, 99, true)
    ON CONFLICT (lead_id, pessoa_id) WHERE lead_id IS NOT NULL DO UPDATE SET explicita = true, papel = 'coparticipante';
  PERFORM pv2_sincronizar_lead(v_lead);
  IF (SELECT papel FROM participacoes WHERE lead_id = v_lead AND pessoa_id = v_conj) IS DISTINCT FROM 'coparticipante' THEN
    RAISE EXCEPTION '3. cônjuge incluído como comprador perdeu o papel';
  END IF;
  DELETE FROM participacoes WHERE lead_id = v_lead AND pessoa_id = v_conj;
  PERFORM pv2_sincronizar_lead(v_lead);
  rel := rel || '3 ok; ';

  -- 4. Vendedor sai do lead → o cônjuge dele sai junto
  DELETE FROM participacoes WHERE lead_id = v_lead AND pessoa_id = v_vend;
  PERFORM pv2_sincronizar_lead(v_lead);
  IF EXISTS (SELECT 1 FROM participacoes WHERE lead_id = v_lead AND pessoa_id = v_conj) THEN
    RAISE EXCEPTION '4. cônjuge continuou no lead depois de o vendedor sair';
  END IF;
  rel := rel || '4 ok; ';

  -- 5. Casamento do vendedor2 encerrado → cônjuge sai do lead (trigger)
  UPDATE pessoas SET estado_civil = 'divorciado', conjuge_pessoa_id = NULL WHERE id = v_vend2;
  IF EXISTS (SELECT 1 FROM participacoes WHERE lead_id = v_lead AND pessoa_id = v_conj2) THEN
    RAISE EXCEPTION '5. cônjuge continuou no lead depois do fim do casamento';
  END IF;
  rel := rel || '5 ok';

  RAISE EXCEPTION 'TESTE 353 OK — % (tudo desfeito)', rel;
END $$;
