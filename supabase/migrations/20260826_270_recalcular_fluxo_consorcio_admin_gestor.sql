-- Restringe recalcular_fluxo_financeiro_consorcio a admin/gestor — apaga e
-- reger parcelas financeiras, ação sensível o suficiente pra não ficar
-- aberta a qualquer usuário ativo da empresa (a UI já escondia o botão,
-- mas a RPC em si não bloqueava chamada direta).

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

  IF EXISTS (
    SELECT 1 FROM financeiro_consorcio_receber WHERE processo_id = p_processo_id AND status <> 'prevista'
    UNION ALL
    SELECT 1 FROM financeiro_consorcio_comercial_pagar WHERE processo_id = p_processo_id AND status <> 'prevista'
  ) THEN
    RAISE EXCEPTION 'Existem parcelas já recebidas/pagas para este processo — não é possível recalcular automaticamente.';
  END IF;

  DELETE FROM financeiro_consorcio_receber WHERE processo_id = p_processo_id AND status = 'prevista';
  DELETE FROM financeiro_consorcio_comercial_pagar WHERE processo_id = p_processo_id AND status = 'prevista';

  RETURN gerar_fluxo_financeiro_consorcio(p_processo_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
