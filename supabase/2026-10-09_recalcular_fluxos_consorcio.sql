-- ============================================================
-- ONE-OFF — recalcula o fluxo financeiro de TODOS os consórcios ativos depois da migration 337.
-- Não é migration. Rodar DEPOIS da 337 e DEPOIS de cadastrar em Configurações › Comissões Consórcio
-- as combinações que faltam (o relatório lista as cotas que ainda caem na reserva).
--
-- Só apaga/regera parcelas 'prevista' (o próprio recalcular_fluxo_financeiro_consorcio preserva
-- cota com parcela recebida/paga). Em 03/10/2026: 1.950 parcelas, todas 'prevista'.
--
-- COMO RODAR (SQL Editor):
--   1ª vez como está (v_simular = true): recalcula, mostra o relatório no ERRO e desfaz tudo.
--   Se o relatório estiver certo, troque para v_simular = false e rode de novo.
-- ============================================================
DO $$
DECLARE
  v_simular boolean := true;
  v_admin   uuid;
  r record; n int; rel text := ''; v_sem_cfg text := '';
BEGIN
  -- O recálculo exige usuário logado admin/gestor/gerente (auth.uid()): usa um admin ativo só
  -- dentro desta transação.
  SELECT id INTO v_admin FROM usuarios WHERE perfil = 'admin' AND ativo = true ORDER BY nome LIMIT 1;
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  FOR r IN SELECT id, numero_processo FROM processos
           WHERE modalidade = 'Consorcio' AND deleted_at IS NULL ORDER BY numero_processo LOOP
    PERFORM recalcular_fluxo_financeiro_consorcio(r.id);
  END LOOP;

  SELECT count(*) INTO n FROM financeiro_consorcio_receber fr JOIN processos p ON p.id = fr.processo_id
   WHERE p.modalidade = 'Consorcio' AND p.deleted_at IS NULL;
  rel := rel || format('parcelas a receber: %s | ', n);
  rel := rel || 'nº de parcelas por cota: ' || coalesce((
    SELECT string_agg(format('%sx = %s cotas', t, c), ', ' ORDER BY t)
    FROM (SELECT total_parcelas t, count(DISTINCT processo_cota_id) c FROM financeiro_consorcio_receber GROUP BY 1) x), '—') || ' | ';
  rel := rel || format('total empresa: R$ %s | total comercial: R$ %s | ',
    (SELECT coalesce(sum(valor_parcela), 0) FROM financeiro_consorcio_receber),
    (SELECT coalesce(sum(valor_parcela), 0) FROM financeiro_consorcio_comercial_pagar));

  -- Cotas ativas sem configuração própria (caem na Padrão/Geral ou, sem ela, no fixo 4%/1%/13x)
  SELECT string_agg(DISTINCT format('%s %s %s', c.administradora_nome, coalesce(c.tipo_bem, '(sem bem)'), c.tipo_parcela), '; ')
    INTO v_sem_cfg
  FROM processo_cotas c JOIN processos p ON p.id = c.processo_id AND p.deleted_at IS NULL
  WHERE c.status_cota = 'ativo' AND NOT EXISTS (
    SELECT 1 FROM financeiro_config_consorcio f
    WHERE f.empresa_id = c.empresa_id
      AND normalizar_texto_config(f.administradora_nome) = normalizar_texto_config(c.administradora_nome)
      AND (f.tipo_bem IS NULL OR normalizar_texto_config(f.tipo_bem) = normalizar_texto_config(c.tipo_bem))
      AND (f.tipo_parcela IS NULL OR f.tipo_parcela = c.tipo_parcela));
  rel := rel || 'SEM configuração própria: ' || coalesce(v_sem_cfg, 'nenhuma');

  IF v_simular THEN
    RAISE EXCEPTION 'SIMULACAO (nada gravado) — %', rel;
  END IF;
  RAISE NOTICE 'RECALCULADO — %', rel;
END $$;
