-- Teste da migration 335 (cônjuge do comprador principal entra sozinho no negócio).
-- Rodar no SQL Editor DEPOIS da 335. Tudo é desfeito no fim (o próprio bloco termina em erro de propósito).
-- Resultado esperado: erro "TESTE 335 OK — ..." com o resumo. Qualquer outro erro = teste falhou.
DO $$
DECLARE
  v_emp uuid; v_modal modalidade_processo;
  v_carlos uuid; v_bia uuid; v_diego uuid; v_kleber uuid; v_proc uuid; v_proc2 uuid;
  v_txt text; rel text := '';
BEGIN
  SELECT id INTO v_emp FROM empresas LIMIT 1;
  SELECT 'SBPE'::modalidade_processo INTO v_modal;

  INSERT INTO pessoas (empresa_id, nome, estado_civil, renda_formal) VALUES (v_emp, 'PV2C CARLOS', 'casado', 9000) RETURNING id INTO v_carlos;
  INSERT INTO pessoas (empresa_id, nome, estado_civil, renda_formal) VALUES (v_emp, 'PV2C BIA', 'casado', 4000) RETURNING id INTO v_bia;
  INSERT INTO pessoas (empresa_id, nome, estado_civil) VALUES (v_emp, 'PV2C DIEGO', 'solteiro') RETURNING id INTO v_diego;
  INSERT INTO pessoas (empresa_id, nome, estado_civil) VALUES (v_emp, 'PV2C KLEBER', 'solteiro') RETURNING id INTO v_kleber;
  UPDATE pessoas SET conjuge_pessoa_id = v_bia WHERE id = v_carlos;
  UPDATE pessoas SET conjuge_pessoa_id = v_carlos WHERE id = v_bia;

  -- 1. Negócio criado direto, só com o Carlos (titular) → Bia entra sozinha como cônjuge anuente, compõe renda
  INSERT INTO processos (empresa_id, numero_processo, nome_imovel, modalidade)
    VALUES (v_emp, 'PV2C-T1', 'PV2C IMOVEL', v_modal) RETURNING id INTO v_proc;
  INSERT INTO participacoes (empresa_id, processo_id, pessoa_id, papel, compoe_renda, ordem, explicita)
    VALUES (v_emp, v_proc, v_carlos, 'titular', true, 99, true);
  PERFORM pv2_sincronizar_processo(v_proc);
  SELECT string_agg(p.nome || ':' || pa.papel || ':' || pa.compoe_renda || ':' || pa.explicita, ',' ORDER BY pa.ordem) INTO v_txt
    FROM participacoes pa JOIN pessoas p ON p.id = pa.pessoa_id WHERE pa.processo_id = v_proc;
  IF v_txt IS DISTINCT FROM 'PV2C CARLOS:titular:true:true,PV2C BIA:conjuge_anuente:true:false' THEN
    RAISE EXCEPTION '1. esperado Carlos titular + Bia cônjuge derivada; veio: %', v_txt;
  END IF;
  rel := rel || '1 ok; ';

  -- 2. Coparticipante incluído depois fica DEPOIS do cônjuge (ordem 3)
  INSERT INTO participacoes (empresa_id, processo_id, pessoa_id, papel, compoe_renda, ordem, explicita)
    VALUES (v_emp, v_proc, v_diego, 'coparticipante', true, 99, true);
  PERFORM pv2_sincronizar_processo(v_proc);
  IF (SELECT ordem FROM participacoes WHERE processo_id = v_proc AND pessoa_id = v_diego) <> 3 THEN
    RAISE EXCEPTION '2. coparticipante deveria ser ordem 3';
  END IF;
  rel := rel || '2 ok; ';

  -- 3. Cônjuge já incluído à mão como comprador → não duplica (continua uma linha só, conjuge_anuente)
  INSERT INTO processos (empresa_id, numero_processo, nome_imovel, modalidade)
    VALUES (v_emp, 'PV2C-T2', 'PV2C IMOVEL 2', v_modal) RETURNING id INTO v_proc2;
  INSERT INTO participacoes (empresa_id, processo_id, pessoa_id, papel, compoe_renda, ordem, explicita) VALUES
    (v_emp, v_proc2, v_carlos, 'titular', true, 99, true),
    (v_emp, v_proc2, v_bia, 'coparticipante', true, 99, true);
  PERFORM pv2_sincronizar_processo(v_proc2);
  IF (SELECT count(*) FROM participacoes WHERE processo_id = v_proc2 AND pessoa_id = v_bia) <> 1
     OR (SELECT papel FROM participacoes WHERE processo_id = v_proc2 AND pessoa_id = v_bia) <> 'conjuge_anuente' THEN
    RAISE EXCEPTION '3. cônjuge incluído à mão duplicou ou perdeu o papel';
  END IF;
  rel := rel || '3 ok; ';

  -- 4. Cônjuge que é o VENDEDOR do negócio não entra como comprador
  DELETE FROM participacoes WHERE processo_id = v_proc2;
  INSERT INTO participacoes (empresa_id, processo_id, pessoa_id, papel, compoe_renda, ordem, explicita) VALUES
    (v_emp, v_proc2, v_carlos, 'titular', true, 99, true),
    (v_emp, v_proc2, v_bia, 'vendedor', false, 99, true);
  PERFORM pv2_sincronizar_processo(v_proc2);
  IF EXISTS (SELECT 1 FROM participacoes WHERE processo_id = v_proc2 AND pessoa_id = v_bia AND papel <> 'vendedor') THEN
    RAISE EXCEPTION '4. cônjuge vendedor entrou também como comprador';
  END IF;
  rel := rel || '4 ok; ';

  -- 5. Casamento encerrado ("Desvincular cônjuge") → Bia sai do negócio 1 e não volta
  UPDATE pessoas SET estado_civil = 'divorciado', conjuge_pessoa_id = NULL WHERE id = v_carlos;
  PERFORM pv2_sincronizar_processo(v_proc);
  IF EXISTS (SELECT 1 FROM participacoes WHERE processo_id = v_proc AND pessoa_id = v_bia) THEN
    RAISE EXCEPTION '5. cônjuge continuou no negócio depois do fim do casamento';
  END IF;
  rel := rel || '5 ok; ';

  -- 6. Titular solteiro: só ele no negócio
  DELETE FROM participacoes WHERE processo_id = v_proc2;
  INSERT INTO participacoes (empresa_id, processo_id, pessoa_id, papel, compoe_renda, ordem, explicita)
    VALUES (v_emp, v_proc2, v_kleber, 'titular', true, 99, true);
  PERFORM pv2_sincronizar_processo(v_proc2);
  IF (SELECT count(*) FROM participacoes WHERE processo_id = v_proc2) <> 1 THEN
    RAISE EXCEPTION '6. titular solteiro ganhou participante a mais';
  END IF;
  rel := rel || '6 ok';

  RAISE EXCEPTION 'TESTE 335 OK — % (tudo desfeito)', rel;
END $$;
