-- Teste da migration 333 (virada). Rodar no SQL Editor DEPOIS da 333.
-- Tudo é desfeito no ROLLBACK. Qualquer RAISE EXCEPTION = teste falhou; sem erro = passou.
BEGIN;
DO $$
DECLARE
  v_emp uuid; v_fase uuid; v_origem lead_origem; v_modal modalidade_processo;
  v_heitor uuid; v_afranio uuid; v_maria uuid; v_ilidio uuid; v_joana uuid; v_lead uuid; v_proc uuid;
  n int; v_txt text;
BEGIN
  SELECT id INTO v_emp FROM empresas LIMIT 1;
  SELECT id INTO v_fase FROM fases WHERE empresa_id = v_emp LIMIT 1;
  SELECT origem INTO v_origem FROM leads LIMIT 1;
  SELECT modalidade INTO v_modal FROM processos LIMIT 1;

  INSERT INTO pessoas (empresa_id, nome, estado_civil) VALUES (v_emp, 'PV2V HEITOR', 'solteiro') RETURNING id INTO v_heitor;
  INSERT INTO pessoas (empresa_id, nome, estado_civil, renda_formal) VALUES (v_emp, 'PV2V AFRANIO', 'casado', 3000) RETURNING id INTO v_afranio;
  INSERT INTO pessoas (empresa_id, nome, estado_civil) VALUES (v_emp, 'PV2V MARIA', 'casado') RETURNING id INTO v_maria;
  INSERT INTO pessoas (empresa_id, nome, estado_civil) VALUES (v_emp, 'PV2V ILIDIO', 'casado') RETURNING id INTO v_ilidio;
  INSERT INTO pessoas (empresa_id, nome, estado_civil) VALUES (v_emp, 'PV2V JOANA', 'casado') RETURNING id INTO v_joana;
  UPDATE pessoas SET conjuge_pessoa_id = v_maria WHERE id = v_afranio;
  UPDATE pessoas SET conjuge_pessoa_id = v_afranio WHERE id = v_maria;
  UPDATE pessoas SET conjuge_pessoa_id = v_joana WHERE id = v_ilidio;
  UPDATE pessoas SET conjuge_pessoa_id = v_ilidio WHERE id = v_joana;

  -- LEAD: titular pelo ponteiro; Afrânio incluído de propósito (como o serviço faz) → Maria vem pelo casamento
  INSERT INTO leads (empresa_id, nome, telefone, fase_id, origem, pessoa_id)
    VALUES (v_emp, 'PV2V LEAD', '5500900000010', v_fase, v_origem, v_heitor) RETURNING id INTO v_lead;
  INSERT INTO participacoes (empresa_id, lead_id, pessoa_id, papel, compoe_renda, ordem, explicita)
    VALUES (v_emp, v_lead, v_afranio, 'coparticipante', true, 99, true);
  PERFORM pv2_sincronizar_lead(v_lead);
  SELECT string_agg(p.nome || ':' || pa.papel, ',' ORDER BY pa.ordem) INTO v_txt
    FROM participacoes pa JOIN pessoas p ON p.id = pa.pessoa_id WHERE pa.lead_id = v_lead;
  IF v_txt IS DISTINCT FROM 'PV2V HEITOR:titular,PV2V AFRANIO:coparticipante,PV2V MARIA:conjuge_anuente' THEN
    -- o cônjuge de um coparticipante não é derivado no lead (só o do titular) — aceita sem Maria
    IF v_txt IS DISTINCT FROM 'PV2V HEITOR:titular,PV2V AFRANIO:coparticipante' THEN
      RAISE EXCEPTION 'lead: participantes inesperados: %', v_txt;
    END IF;
  END IF;

  -- Remover o incluído de propósito tira da proposta
  DELETE FROM participacoes WHERE lead_id = v_lead AND pessoa_id = v_afranio;
  PERFORM pv2_sincronizar_lead(v_lead);
  IF EXISTS (SELECT 1 FROM participacoes WHERE lead_id = v_lead AND pessoa_id = v_afranio) THEN
    RAISE EXCEPTION 'lead: coparticipante removido voltou pela sincronização';
  END IF;

  -- NEGÓCIO: Heitor titular + Afrânio comprador; Ilídio vendedor casado com Joana → Joana assina (conjuge_vendedor)
  INSERT INTO processos (empresa_id, numero_processo, nome_imovel, modalidade)
    VALUES (v_emp, 'PV2V-TESTE', 'PV2V IMOVEL', v_modal) RETURNING id INTO v_proc;
  INSERT INTO participacoes (empresa_id, processo_id, pessoa_id, papel, compoe_renda, ordem, explicita) VALUES
    (v_emp, v_proc, v_heitor, 'titular', true, 99, true),
    (v_emp, v_proc, v_afranio, 'coparticipante', true, 99, true),
    (v_emp, v_proc, v_ilidio, 'vendedor', false, 99, true);
  PERFORM pv2_sincronizar_processo(v_proc);
  IF (SELECT papel FROM participacoes WHERE processo_id = v_proc AND pessoa_id = v_heitor) <> 'titular' THEN
    RAISE EXCEPTION 'negócio: titular perdido'; END IF;
  IF (SELECT papel FROM participacoes WHERE processo_id = v_proc AND pessoa_id = v_joana) IS DISTINCT FROM 'conjuge_vendedor' THEN
    RAISE EXCEPTION 'negócio: cônjuge do vendedor não foi derivado do casamento'; END IF;
  IF (SELECT explicita FROM participacoes WHERE processo_id = v_proc AND pessoa_id = v_joana) THEN
    RAISE EXCEPTION 'negócio: cônjuge derivado marcado como incluído de propósito'; END IF;
  IF (SELECT pessoa_id FROM processos WHERE id = v_proc) IS DISTINCT FROM v_heitor THEN
    RAISE EXCEPTION 'negócio: processos.pessoa_id não acompanha o titular'; END IF;

  -- Joana também proprietária (incluída de propósito como vendedora) → deixa de ser só cônjuge
  UPDATE participacoes SET papel = 'vendedor', explicita = true WHERE processo_id = v_proc AND pessoa_id = v_joana;
  PERFORM pv2_sincronizar_processo(v_proc);
  SELECT count(*) INTO n FROM participacoes WHERE processo_id = v_proc AND papel = 'vendedor';
  IF n <> 2 THEN RAISE EXCEPTION 'negócio: esperado 2 vendedores (Ilídio + Joana), veio %', n; END IF;

  -- Tabelas antigas: somente leitura
  BEGIN
    INSERT INTO lead_coparticipantes (empresa_id, lead_id, pessoa_id) VALUES (v_emp, v_lead, v_maria);
    RAISE EXCEPTION 'tabela antiga aceitou INSERT';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%tabela_antiga_somente_leitura%' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO processo_compradores (empresa_id, processo_id, nome, principal) VALUES (v_emp, v_proc, 'X', false);
    RAISE EXCEPTION 'tabela antiga aceitou INSERT';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%tabela_antiga_somente_leitura%' THEN RAISE; END IF;
  END;

  -- Telefone: a RPC não toca mais processo_compradores (rodaria sem auth.uid; só confere que a função existe)
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'atualizar_telefone_pessoa'
                 AND pg_get_functiondef(oid) NOT LIKE '%UPDATE processo_compradores%') THEN
    RAISE EXCEPTION 'atualizar_telefone_pessoa ainda escreve em processo_compradores'; END IF;

  RAISE NOTICE 'virada 333: todos os testes passaram';
END $$;
ROLLBACK;
