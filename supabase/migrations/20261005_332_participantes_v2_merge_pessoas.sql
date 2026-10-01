-- Participantes V2 — B2c-C1d: merge de Pessoas numa transação só.
--
-- Antes: a rota /api/pessoas/[id]/merge movia 6 colunas (telefones, leads, conversas,
-- processo_compradores/vendedores) uma a uma, sem conferir erro, e apagava a secundária. Faltavam ~18
-- colunas que apontam para pessoas (documentos, lead_coparticipantes, lead_vendedores, participacoes,
-- cônjuge, histórico...). E pessoas_alteracoes é ON DELETE RESTRICT: com qualquer histórico, o DELETE
-- falhava em silêncio e a rota respondia "ok" com as duas pessoas meio mescladas.
--
-- Agora: tudo ou nada. Conflitos que exigem decisão humana param com mensagem clara (nada é gravado):
--   merge_operador            — uma das duas é Pessoa de usuário da equipe
--   merge_conjuges_diferentes — cada uma casada com uma pessoa diferente
--   merge_dois_leads_abertos  — as duas têm lead aberto (leads_pessoa_aberto_unico, migration 311)
-- Chamada só pela rota (service role): sem GRANT para authenticated/anon.
--
-- A sincronização da Fase A fica desligada durante a merge e roda uma vez no fim em cada lead/negócio afetado.
-- Idempotente (CREATE OR REPLACE). Sem efeito em dado nenhum até alguém mesclar.

CREATE OR REPLACE FUNCTION merge_pessoas(p_principal uuid, p_secundaria uuid, p_empresa uuid, p_usuario uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  pri pessoas%ROWTYPE;
  sec pessoas%ROWTYPE;
  r record;
  v_outro uuid;
  v_tem_principal boolean;
  v_leads uuid[];
  v_processos uuid[];
BEGIN
  IF p_principal IS NULL OR p_secundaria IS NULL OR p_principal = p_secundaria THEN
    RAISE EXCEPTION 'merge_invalido';
  END IF;
  -- trava as duas (mesma ordem sempre) contra merges/edições simultâneos
  PERFORM pg_advisory_xact_lock(hashtext(least(p_principal, p_secundaria)::text));
  PERFORM pg_advisory_xact_lock(hashtext(greatest(p_principal, p_secundaria)::text));

  SELECT * INTO pri FROM pessoas WHERE id = p_principal AND empresa_id = p_empresa AND deleted_at IS NULL FOR UPDATE;
  SELECT * INTO sec FROM pessoas WHERE id = p_secundaria AND empresa_id = p_empresa AND deleted_at IS NULL FOR UPDATE;
  IF pri.id IS NULL OR sec.id IS NULL THEN RAISE EXCEPTION 'merge_pessoa_nao_encontrada'; END IF;
  IF pessoa_e_de_operador(p_principal) OR pessoa_e_de_operador(p_secundaria) THEN RAISE EXCEPTION 'merge_operador'; END IF;
  IF pri.conjuge_pessoa_id IS NOT NULL AND sec.conjuge_pessoa_id IS NOT NULL
     AND pri.conjuge_pessoa_id <> sec.conjuge_pessoa_id
     AND pri.conjuge_pessoa_id <> p_secundaria AND sec.conjuge_pessoa_id <> p_principal THEN
    RAISE EXCEPTION 'merge_conjuges_diferentes';
  END IF;

  -- Propostas afetadas (antes de mover) — ressincronizadas uma vez no fim. Durante a merge a
  -- sincronização da Fase A fica desligada (mesma chave do backfill, local à transação) pra não
  -- rodar sobre um estado pela metade.
  SELECT coalesce(array_agg(DISTINCT x), '{}') INTO v_leads FROM (
    SELECT id AS x FROM leads WHERE p_secundaria IN (pessoa_id, conjuge_pessoa_id, vendedor_pessoa_id)
       OR p_principal IN (pessoa_id, conjuge_pessoa_id, vendedor_pessoa_id)
    UNION SELECT lead_id FROM lead_coparticipantes WHERE pessoa_id IN (p_principal, p_secundaria)
    UNION SELECT lead_id FROM lead_vendedores WHERE pessoa_id IN (p_principal, p_secundaria)
    UNION SELECT lead_id FROM participacoes WHERE lead_id IS NOT NULL AND pessoa_id IN (p_principal, p_secundaria)
  ) t;
  SELECT coalesce(array_agg(DISTINCT x), '{}') INTO v_processos FROM (
    SELECT id AS x FROM processos WHERE pessoa_id IN (p_principal, p_secundaria)
    UNION SELECT processo_id FROM processo_compradores WHERE pessoa_id IN (p_principal, p_secundaria)
    UNION SELECT processo_id FROM processo_vendedores WHERE pessoa_id IN (p_principal, p_secundaria)
    UNION SELECT processo_id FROM participacoes WHERE processo_id IS NOT NULL AND pessoa_id IN (p_principal, p_secundaria)
  ) t;
  PERFORM set_config('pv2.backfill', 'on', true);

  -- 1. Leads (o índice único de lead aberto por pessoa decide se dá)
  BEGIN
    UPDATE leads SET pessoa_id = p_principal WHERE pessoa_id = p_secundaria AND empresa_id = p_empresa;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'merge_dois_leads_abertos';
  END;
  UPDATE leads SET conjuge_pessoa_id  = CASE WHEN pessoa_id = p_principal THEN NULL ELSE p_principal END
    WHERE conjuge_pessoa_id = p_secundaria AND empresa_id = p_empresa;
  UPDATE leads SET conjuge_pessoa_id = NULL WHERE conjuge_pessoa_id = p_principal AND pessoa_id = p_principal;
  UPDATE leads SET vendedor_pessoa_id = p_principal WHERE vendedor_pessoa_id = p_secundaria AND empresa_id = p_empresa;

  -- 2. Participações (modelo novo) ANTES das tabelas antigas: a sincronização mantém as que já existem
  --    (preserva compoe_renda/compoe_renda_manual). Mesma proposta com as duas → fica a da principal.
  DELETE FROM participacoes s WHERE s.pessoa_id = p_secundaria AND EXISTS (
    SELECT 1 FROM participacoes p WHERE p.pessoa_id = p_principal
      AND (p.lead_id = s.lead_id OR p.processo_id = s.processo_id));
  UPDATE participacoes SET pessoa_id = p_principal WHERE pessoa_id = p_secundaria;

  -- 3. Tabelas antigas de participantes (mesmo critério: na mesma proposta fica a linha da principal)
  DELETE FROM lead_coparticipantes s WHERE s.pessoa_id = p_secundaria AND EXISTS (
    SELECT 1 FROM lead_coparticipantes p WHERE p.lead_id = s.lead_id AND p.pessoa_id = p_principal);
  UPDATE lead_coparticipantes SET pessoa_id = p_principal WHERE pessoa_id = p_secundaria;
  -- a principal não pode ser coparticipante do lead do qual é titular
  DELETE FROM lead_coparticipantes c USING leads l
    WHERE c.lead_id = l.id AND c.pessoa_id = p_principal AND l.pessoa_id = p_principal;
  DELETE FROM lead_vendedores s WHERE s.pessoa_id = p_secundaria AND EXISTS (
    SELECT 1 FROM lead_vendedores p WHERE p.lead_id = s.lead_id AND p.pessoa_id = p_principal);
  UPDATE lead_vendedores SET pessoa_id = p_principal WHERE pessoa_id = p_secundaria;
  -- se a linha que sai era a do comprador principal, a da principal herda o "principal"
  UPDATE processo_compradores p SET principal = true FROM processo_compradores s
    WHERE s.pessoa_id = p_secundaria AND s.principal AND p.processo_id = s.processo_id AND p.pessoa_id = p_principal;
  DELETE FROM processo_compradores s WHERE s.pessoa_id = p_secundaria AND EXISTS (
    SELECT 1 FROM processo_compradores p WHERE p.processo_id = s.processo_id AND p.pessoa_id = p_principal);
  UPDATE processo_compradores SET pessoa_id = p_principal WHERE pessoa_id = p_secundaria AND empresa_id = p_empresa;
  DELETE FROM processo_vendedores s WHERE s.pessoa_id = p_secundaria AND EXISTS (
    SELECT 1 FROM processo_vendedores p WHERE p.processo_id = s.processo_id AND p.pessoa_id = p_principal);
  UPDATE processo_vendedores SET pessoa_id = p_principal WHERE pessoa_id = p_secundaria AND empresa_id = p_empresa;
  UPDATE processos SET pessoa_id = p_principal WHERE pessoa_id = p_secundaria AND empresa_id = p_empresa;

  -- 4. Telefones: repetido fica o da principal; principal continua sendo o da principal (se ela tiver)
  DELETE FROM pessoa_telefones s WHERE s.pessoa_id = p_secundaria AND EXISTS (
    SELECT 1 FROM pessoa_telefones p WHERE p.pessoa_id = p_principal AND p.telefone = s.telefone);
  SELECT EXISTS (SELECT 1 FROM pessoa_telefones WHERE pessoa_id = p_principal AND principal AND ativo) INTO v_tem_principal;
  UPDATE pessoa_telefones SET pessoa_id = p_principal, principal = CASE WHEN v_tem_principal THEN false ELSE principal END
    WHERE pessoa_id = p_secundaria;

  -- 5. Documentos de identificação: um por tipo — o da principal vence
  DELETE FROM pessoa_documentos_identificacao s WHERE s.pessoa_id = p_secundaria AND EXISTS (
    SELECT 1 FROM pessoa_documentos_identificacao p WHERE p.pessoa_id = p_principal AND p.tipo_documento = s.tipo_documento);
  UPDATE pessoa_documentos_identificacao SET pessoa_id = p_principal WHERE pessoa_id = p_secundaria;

  -- 6. Casamento: relacionamentos da secundária passam para a principal (entre as duas → some)
  FOR r IN SELECT * FROM pessoa_relacionamentos WHERE p_secundaria IN (pessoa_a_id, pessoa_b_id) LOOP
    v_outro := CASE WHEN r.pessoa_a_id = p_secundaria THEN r.pessoa_b_id ELSE r.pessoa_a_id END;
    IF v_outro = p_principal OR EXISTS (
      SELECT 1 FROM pessoa_relacionamentos x WHERE x.id <> r.id
        AND x.pessoa_a_id = least(v_outro, p_principal) AND x.pessoa_b_id = greatest(v_outro, p_principal)
        AND (x.data_fim IS NULL) = (r.data_fim IS NULL)) THEN
      DELETE FROM pessoa_relacionamentos WHERE id = r.id;
    ELSE
      UPDATE pessoa_relacionamentos SET pessoa_a_id = least(v_outro, p_principal), pessoa_b_id = greatest(v_outro, p_principal)
        WHERE id = r.id;
    END IF;
  END LOOP;
  UPDATE pessoas SET conjuge_pessoa_id = p_principal WHERE conjuge_pessoa_id = p_secundaria AND id <> p_principal;
  IF pri.conjuge_pessoa_id = p_secundaria THEN
    UPDATE pessoas SET conjuge_pessoa_id = NULL WHERE id = p_principal;
  ELSIF pri.conjuge_pessoa_id IS NULL AND sec.conjuge_pessoa_id IS NOT NULL AND sec.conjuge_pessoa_id <> p_principal THEN
    UPDATE pessoas SET conjuge_pessoa_id = sec.conjuge_pessoa_id,
      estado_civil = coalesce(sec.estado_civil, estado_civil),
      regime_casamento = coalesce(regime_casamento, sec.regime_casamento),
      data_casamento = coalesce(data_casamento, sec.data_casamento)
    WHERE id = p_principal;
  END IF;

  -- 7. Demais vínculos (sem unicidade por pessoa)
  UPDATE conversas SET pessoa_id = p_principal WHERE pessoa_id = p_secundaria AND empresa_id = p_empresa;
  UPDATE documentos SET pessoa_id = p_principal WHERE pessoa_id = p_secundaria;
  UPDATE documentos_compartilhamentos SET pessoa_id_destino = p_principal WHERE pessoa_id_destino = p_secundaria;
  UPDATE solicitacoes_operacionais SET pessoa_id = p_principal WHERE pessoa_id = p_secundaria;
  UPDATE email_envios SET pessoa_id = p_principal WHERE pessoa_id = p_secundaria;
  UPDATE fonti_marcas SET pessoa_id = p_principal WHERE pessoa_id = p_secundaria;
  UPDATE parceiros SET pessoa_id = p_principal WHERE pessoa_id = p_secundaria;
  UPDATE pessoa_fgts_contas SET pessoa_id = p_principal WHERE pessoa_id = p_secundaria;
  UPDATE financeiro_comissoes_pagar SET pessoa_id = p_principal WHERE pessoa_id = p_secundaria AND empresa_id = p_empresa;
  UPDATE pessoas_alteracoes SET pessoa_id = p_principal WHERE pessoa_id = p_secundaria;

  -- 8. Dados: só preenche o que a principal não tem (nunca sobrescreve). CPF sai da secundária antes
  --    (índice único de CPF por empresa).
  UPDATE pessoas SET cpf = NULL WHERE id = p_secundaria;
  UPDATE pessoas SET
    cpf = coalesce(cpf, sec.cpf), email = coalesce(email, sec.email), data_nascimento = coalesce(data_nascimento, sec.data_nascimento),
    observacoes = CASE WHEN sec.observacoes IS NULL OR sec.observacoes = '' THEN observacoes
                       WHEN observacoes IS NULL OR observacoes = '' THEN sec.observacoes
                       ELSE observacoes || E'\n\n' || sec.observacoes END,
    rg = coalesce(rg, sec.rg), profissao = coalesce(profissao, sec.profissao),
    estado_civil = coalesce(estado_civil, sec.estado_civil),
    renda_formal = coalesce(renda_formal, sec.renda_formal), renda_informal = coalesce(renda_informal, sec.renda_informal),
    nacionalidade = coalesce(nacionalidade, sec.nacionalidade), sexo = coalesce(sexo, sec.sexo),
    endereco_rua = coalesce(endereco_rua, sec.endereco_rua), endereco_numero = coalesce(endereco_numero, sec.endereco_numero),
    endereco_complemento = coalesce(endereco_complemento, sec.endereco_complemento),
    endereco_bairro = coalesce(endereco_bairro, sec.endereco_bairro), endereco_cidade = coalesce(endereco_cidade, sec.endereco_cidade),
    endereco_uf = coalesce(endereco_uf, sec.endereco_uf), endereco_cep = coalesce(endereco_cep, sec.endereco_cep),
    empresa_nome = coalesce(empresa_nome, sec.empresa_nome), empresa_cnpj = coalesce(empresa_cnpj, sec.empresa_cnpj),
    municipio_trabalho = coalesce(municipio_trabalho, sec.municipio_trabalho), uf_trabalho = coalesce(uf_trabalho, sec.uf_trabalho),
    conta_bancaria_banco = coalesce(conta_bancaria_banco, sec.conta_bancaria_banco),
    conta_bancaria_agencia = coalesce(conta_bancaria_agencia, sec.conta_bancaria_agencia),
    conta_bancaria_numero = coalesce(conta_bancaria_numero, sec.conta_bancaria_numero),
    conta_bancaria_digito = coalesce(conta_bancaria_digito, sec.conta_bancaria_digito),
    orgao_emissor = coalesce(orgao_emissor, sec.orgao_emissor), data_emissao = coalesce(data_emissao, sec.data_emissao),
    filiacao_mae = coalesce(filiacao_mae, sec.filiacao_mae), filiacao_pai = coalesce(filiacao_pai, sec.filiacao_pai),
    cidade_nascimento = coalesce(cidade_nascimento, sec.cidade_nascimento), estado_nascimento = coalesce(estado_nascimento, sec.estado_nascimento),
    registro_cnh = coalesce(registro_cnh, sec.registro_cnh), validade_cnh = coalesce(validade_cnh, sec.validade_cnh),
    primeira_habilitacao_cnh = coalesce(primeira_habilitacao_cnh, sec.primeira_habilitacao_cnh),
    particularidade = coalesce(particularidade, sec.particularidade), patrimonio_total = coalesce(patrimonio_total, sec.patrimonio_total)
  WHERE id = p_principal;

  -- 9. Histórico na principal e exclusão da secundária (nada mais aponta para ela)
  INSERT INTO pessoas_alteracoes (pessoa_id, empresa_id, usuario_id, campos_alterados, valores_anteriores, valores_novos, origem)
  VALUES (p_principal, p_empresa, p_usuario, ARRAY['merge'],
    jsonb_build_object('pessoa_mesclada_id', p_secundaria, 'nome', sec.nome, 'cpf', sec.cpf),
    jsonb_build_object('pessoa_principal_id', p_principal), 'pessoas');
  DELETE FROM pessoas WHERE id = p_secundaria;

  -- 10. Sincronização (Fase A) uma vez, com tudo no lugar
  PERFORM set_config('pv2.backfill', 'off', true);
  PERFORM pv2_sincronizar_relacionamento_pessoa(p_principal);
  FOR r IN SELECT unnest(v_leads) AS id LOOP PERFORM pv2_sincronizar_lead(r.id); END LOOP;
  FOR r IN SELECT unnest(v_processos) AS id LOOP PERFORM pv2_sincronizar_processo(r.id); END LOOP;

  RETURN jsonb_build_object('ok', true, 'pessoa_principal_id', p_principal);
END $$;

REVOKE ALL ON FUNCTION merge_pessoas(uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION merge_pessoas(uuid, uuid, uuid, uuid) TO service_role;
