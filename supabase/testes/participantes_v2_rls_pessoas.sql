-- ============================================================
-- Test: Pessoa visível por participação (migration 325)
-- Simula um comercial e verifica se consegue enxergar:
-- 1. Coparticipante de um lead da carteira dele
-- 2. Cônjuge do coparticipante (via pessoa_relacionamentos)
-- 3. Participações do lead
-- Antes de rodar:
--   SELECT auth_user_id, nome FROM usuarios WHERE perfil = 'comercial' AND ativo LIMIT 5;
--   Troque v_auth por um auth_user_id real.
-- ============================================================

BEGIN;
DO $$
DECLARE
  v_auth uuid := '00000000-0000-0000-0000-000000000000'; -- ← auth_user_id de um comercial ativo
  v_usr uuid; v_emp uuid; v_fase uuid; v_origem lead_origem;
  v_tit uuid; v_cop uuid; v_esposa uuid; v_estranho uuid; v_lead uuid; n int;
BEGIN
  SELECT id, empresa_id INTO v_usr, v_emp FROM usuarios WHERE auth_user_id = v_auth;
  IF v_usr IS NULL THEN RAISE EXCEPTION 'troque v_auth por um auth_user_id real'; END IF;
  SELECT id INTO v_fase FROM fases WHERE empresa_id = v_emp LIMIT 1;
  SELECT origem INTO v_origem FROM leads LIMIT 1;
  INSERT INTO pessoas (empresa_id, nome) VALUES (v_emp, 'PV2 TIT') RETURNING id INTO v_tit;
  INSERT INTO pessoas (empresa_id, nome) VALUES (v_emp, 'PV2 COP') RETURNING id INTO v_cop;
  INSERT INTO pessoas (empresa_id, nome) VALUES (v_emp, 'PV2 ESPOSA') RETURNING id INTO v_esposa;
  INSERT INTO pessoas (empresa_id, nome) VALUES (v_emp, 'PV2 ESTRANHO') RETURNING id INTO v_estranho;
  INSERT INTO leads (empresa_id, nome, telefone, fase_id, origem, responsavel_id, pessoa_id)
    VALUES (v_emp, 'PV2 LEAD', '5544900000001', v_fase, v_origem, v_usr, v_tit) RETURNING id INTO v_lead;
  INSERT INTO participacoes (empresa_id, lead_id, pessoa_id, papel, compoe_renda, ordem)
    VALUES (v_emp, v_lead, v_tit, 'titular', true, 1), (v_emp, v_lead, v_cop, 'coparticipante', true, 2);
  INSERT INTO pessoa_relacionamentos (empresa_id, pessoa_a_id, pessoa_b_id, tipo)
    VALUES (v_emp, least(v_cop, v_esposa), greatest(v_cop, v_esposa), 'casamento');

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  IF usuario_atual_pode('leads.ver_todas') THEN
    RAISE NOTICE 'comercial escolhido tem leads.ver_todas — teste inconclusivo, escolha outro'; RETURN;
  END IF;
  SELECT count(*) INTO n FROM pessoas WHERE id IN (v_cop, v_esposa);
  IF n <> 2 THEN RAISE EXCEPTION 'coparticipante/cônjuge dele invisíveis (viu %)', n; END IF;
  SELECT count(*) INTO n FROM pessoas WHERE id = v_estranho;
  IF n <> 0 THEN RAISE EXCEPTION 'pessoa sem vínculo ficou visível'; END IF;
  SELECT count(*) INTO n FROM participacoes WHERE lead_id = v_lead;
  IF n <> 2 THEN RAISE EXCEPTION 'participações do lead dele invisíveis (viu %)', n; END IF;
  RAISE NOTICE 'OK: RLS pessoas por participação';
END $$;
ROLLBACK;
