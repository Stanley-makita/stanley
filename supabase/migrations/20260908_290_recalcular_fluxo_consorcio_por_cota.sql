-- Corrige recalcular_fluxo_financeiro_consorcio (migration 270): o bloqueio
-- de "existem parcelas já recebidas/pagas" era feito pelo PROCESSO inteiro,
-- então uma única cota com parcela já paga travava o recálculo de TODAS as
-- outras cotas do mesmo processo, mesmo as que nunca tiveram nada pago.
--
-- Agora a trava é por COTA: só apagamos e regeramos as parcelas 'prevista'
-- das cotas que não têm nenhuma parcela 'recebida'/'paga'/'cancelada' fora
-- do padrão; cotas com histórico financeiro real ficam intocadas e são
-- simplesmente puladas (gerar_fluxo_financeiro_consorcio já não sobrescreve
-- parcela existente por causa do ON CONFLICT DO NOTHING).

CREATE OR REPLACE FUNCTION recalcular_fluxo_financeiro_consorcio(p_processo_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_processo RECORD;
  v_perfil   TEXT;
BEGIN
  SELECT u.perfil INTO v_perfil
  FROM usuarios u
  WHERE u.id = auth.uid() AND u.ativo = true;

  IF v_perfil NOT IN ('admin', 'gestor', 'gerente') THEN
    RAISE EXCEPTION 'Sem permissão para recalcular o fluxo financeiro — só admin/gestor.';
  END IF;

  SELECT p.* INTO v_processo
  FROM processos p
  WHERE p.id = p_processo_id
    AND p.empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Processo não encontrado ou acesso negado';
  END IF;

  IF v_processo.modalidade <> 'Consorcio' THEN
    RAISE EXCEPTION 'Recalcular fluxo financeiro só se aplica a processos modalidade Consorcio';
  END IF;

  -- Cotas com histórico financeiro real (parcela recebida/paga/cancelada)
  -- ficam de fora do apaga-e-regera: mantemos essas parcelas exatamente
  -- como estão, sejam 'prevista' ou não.
  DELETE FROM financeiro_consorcio_receber
  WHERE processo_id = p_processo_id AND status = 'prevista'
    AND processo_cota_id NOT IN (
      SELECT processo_cota_id FROM financeiro_consorcio_receber
      WHERE processo_id = p_processo_id AND status <> 'prevista'
      UNION
      SELECT processo_cota_id FROM financeiro_consorcio_comercial_pagar
      WHERE processo_id = p_processo_id AND status <> 'prevista'
    );

  DELETE FROM financeiro_consorcio_comercial_pagar
  WHERE processo_id = p_processo_id AND status = 'prevista'
    AND processo_cota_id NOT IN (
      SELECT processo_cota_id FROM financeiro_consorcio_receber
      WHERE processo_id = p_processo_id AND status <> 'prevista'
      UNION
      SELECT processo_cota_id FROM financeiro_consorcio_comercial_pagar
      WHERE processo_id = p_processo_id AND status <> 'prevista'
    );

  RETURN gerar_fluxo_financeiro_consorcio(p_processo_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
