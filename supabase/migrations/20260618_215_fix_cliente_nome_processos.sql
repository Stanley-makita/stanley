-- Migration 215: Fix cliente_nome nas funções puxar_processos_emitidos e puxar_contratos
-- A tabela processos não tem coluna cliente_nome.
-- O nome do comprador vem de processo_compradores (JOIN).

-- ============================================================
-- 1. CORRIGIR puxar_processos_emitidos
-- ============================================================
CREATE OR REPLACE FUNCTION puxar_processos_emitidos(
  p_fechamento_id UUID
)
RETURNS INTEGER AS $$
DECLARE
  v_fechamento    RECORD;
  v_proc          RECORD;
  v_pct_empresa   NUMERIC;
  v_count         INTEGER := 0;
BEGIN
  SELECT f.*, u.empresa_id AS user_empresa
  INTO v_fechamento
  FROM financeiro_fechamentos f
  JOIN usuarios u ON u.id = auth.uid()
  WHERE f.id = p_fechamento_id AND f.empresa_id = u.empresa_id AND u.ativo = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fechamento não encontrado ou acesso negado';
  END IF;

  IF v_fechamento.status = 'travado' THEN
    RAISE EXCEPTION 'Fechamento travado. Reabra antes de puxar processos.';
  END IF;

  FOR v_proc IN
    SELECT
      p.id,
      p.numero_processo,
      p.banco_id,
      p.comercial_id,
      p.operacional_id,
      p.valor_financiado,
      p.data_emissao,
      p.status_emissao,
      p.modalidade,
      COALESCE(pe.nome, pc.nome, '') AS cliente_nome
    FROM processos p
    LEFT JOIN pessoas pe ON pe.id = p.pessoa_id
    LEFT JOIN LATERAL (
      SELECT nome FROM processo_compradores
      WHERE processo_id = p.id
      ORDER BY principal DESC NULLS LAST
      LIMIT 1
    ) pc ON true
    WHERE p.empresa_id = v_fechamento.empresa_id
      AND p.status_emissao = 'emitido'
      AND p.modalidade NOT IN ('Contrato', 'Consorcio')
      AND EXTRACT(MONTH FROM p.data_emissao) = v_fechamento.competencia_mes
      AND EXTRACT(YEAR  FROM p.data_emissao) = v_fechamento.competencia_ano
      AND NOT EXISTS (
        SELECT 1 FROM financeiro_fechamento_processos fp
        WHERE fp.processo_id = p.id AND fp.fechamento_id = p_fechamento_id
      )
  LOOP
    SELECT COALESCE(cp.comissao_empresa, 0)
    INTO v_pct_empresa
    FROM comissoes_padrao cp
    WHERE cp.empresa_id = v_fechamento.empresa_id AND cp.banco_id = v_proc.banco_id
    LIMIT 1;

    IF NOT FOUND THEN v_pct_empresa := 0; END IF;

    INSERT INTO financeiro_fechamento_processos (
      fechamento_id, empresa_id, processo_id, cliente_nome, banco_id, modalidade,
      valor_financiado, data_emissao, comercial_id, operacional_id, status_origem
    ) VALUES (
      p_fechamento_id, v_fechamento.empresa_id, v_proc.id, v_proc.cliente_nome,
      v_proc.banco_id, v_proc.modalidade, v_proc.valor_financiado, v_proc.data_emissao,
      v_proc.comercial_id, v_proc.operacional_id, v_proc.status_emissao
    );

    INSERT INTO financeiro_contas_receber (
      empresa_id, fechamento_id, processo_id, banco_id, cliente_nome, origem,
      valor_base, percentual_previsto, valor_previsto, status
    ) VALUES (
      v_fechamento.empresa_id, p_fechamento_id, v_proc.id, v_proc.banco_id, v_proc.cliente_nome,
      'emissao', COALESCE(v_proc.valor_financiado, 0), v_pct_empresa,
      COALESCE(v_proc.valor_financiado, 0) * v_pct_empresa / 100,
      'a_faturar'
    );

    IF v_proc.comercial_id IS NULL THEN
      INSERT INTO financeiro_conferencias (
        empresa_id, fechamento_id, tipo, severidade, status, titulo, descricao,
        entidade_tipo, entidade_id
      ) VALUES (
        v_fechamento.empresa_id, p_fechamento_id, 'processo_sem_comercial', 'alerta', 'pendente',
        'Processo sem comercial', 'O processo não possui comercial vinculado.',
        'financeiro_fechamento_processos', v_proc.id
      ) ON CONFLICT DO NOTHING;
    END IF;

    IF v_proc.operacional_id IS NULL THEN
      INSERT INTO financeiro_conferencias (
        empresa_id, fechamento_id, tipo, severidade, status, titulo, descricao,
        entidade_tipo, entidade_id
      ) VALUES (
        v_fechamento.empresa_id, p_fechamento_id, 'processo_sem_operacional', 'info', 'pendente',
        'Processo sem operacional', 'O processo não possui operacional vinculado.',
        'financeiro_fechamento_processos', v_proc.id
      ) ON CONFLICT DO NOTHING;
    END IF;

    v_count := v_count + 1;
  END LOOP;

  UPDATE financeiro_fechamentos
  SET status = 'em_conferencia', updated_at = now()
  WHERE id = p_fechamento_id AND status = 'rascunho';

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 2. CORRIGIR puxar_contratos
-- ============================================================
CREATE OR REPLACE FUNCTION puxar_contratos(
  p_fechamento_id UUID
)
RETURNS INTEGER AS $$
DECLARE
  v_fechamento  RECORD;
  v_proc        RECORD;
  v_count       INTEGER := 0;
  v_valor       NUMERIC;
  v_fp_id       UUID;
BEGIN
  SELECT f.*, u.empresa_id AS user_empresa
  INTO v_fechamento
  FROM financeiro_fechamentos f
  JOIN usuarios u ON u.id = auth.uid()
  WHERE f.id = p_fechamento_id AND f.empresa_id = u.empresa_id AND u.ativo = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fechamento não encontrado ou acesso negado';
  END IF;

  IF v_fechamento.status = 'travado' THEN
    RAISE EXCEPTION 'Fechamento travado. Reabra antes de importar contratos.';
  END IF;

  FOR v_proc IN
    SELECT
      p.id,
      p.numero_processo,
      p.comercial_id,
      p.juridico_id,
      p.valor_contrato,
      p.data_emissao,
      p.status_emissao,
      p.modalidade,
      COALESCE(pe.nome, pc.nome, '') AS cliente_nome
    FROM processos p
    LEFT JOIN pessoas pe ON pe.id = p.pessoa_id
    LEFT JOIN LATERAL (
      SELECT nome FROM processo_compradores
      WHERE processo_id = p.id
      ORDER BY principal DESC NULLS LAST
      LIMIT 1
    ) pc ON true
    WHERE p.empresa_id = v_fechamento.empresa_id
      AND p.modalidade = 'Contrato'
      AND p.status_emissao = 'emitido'
      AND EXTRACT(MONTH FROM p.data_emissao) = v_fechamento.competencia_mes
      AND EXTRACT(YEAR  FROM p.data_emissao) = v_fechamento.competencia_ano
      AND NOT EXISTS (
        SELECT 1 FROM financeiro_fechamento_processos fp
        WHERE fp.processo_id = p.id AND fp.fechamento_id = p_fechamento_id
      )
  LOOP
    v_valor := COALESCE(v_proc.valor_contrato, 0);

    INSERT INTO financeiro_fechamento_processos (
      fechamento_id, empresa_id, processo_id, cliente_nome, banco_id, modalidade,
      valor_financiado, data_emissao, comercial_id, operacional_id, status_origem
    ) VALUES (
      p_fechamento_id, v_fechamento.empresa_id, v_proc.id, v_proc.cliente_nome,
      NULL, 'Contrato', v_valor, v_proc.data_emissao,
      v_proc.comercial_id, v_proc.juridico_id, v_proc.status_emissao
    )
    RETURNING id INTO v_fp_id;

    INSERT INTO financeiro_contas_receber (
      empresa_id, fechamento_id, processo_id, banco_id, cliente_nome, origem,
      valor_base, percentual_previsto, valor_previsto, status
    ) VALUES (
      v_fechamento.empresa_id, p_fechamento_id, v_proc.id, NULL, v_proc.cliente_nome,
      'contrato', v_valor, 0, v_valor,
      'a_faturar'
    );

    IF v_proc.comercial_id IS NOT NULL AND v_valor > 0 THEN
      INSERT INTO financeiro_comissoes_pagar (
        empresa_id, fechamento_id, processo_id,
        usuario_id, tipo_destinatario, papel, regra_id,
        valor_base, percentual, valor_calculado, status
      ) VALUES (
        v_fechamento.empresa_id, p_fechamento_id, v_proc.id,
        v_proc.comercial_id, 'usuario', 'comercial', NULL,
        v_valor, 100, v_valor, 'calculada'
      );
    END IF;

    IF v_proc.comercial_id IS NULL THEN
      INSERT INTO financeiro_conferencias (
        empresa_id, fechamento_id, tipo, severidade, status, titulo, descricao,
        entidade_tipo, entidade_id
      ) VALUES (
        v_fechamento.empresa_id, p_fechamento_id, 'processo_sem_comercial', 'alerta', 'pendente',
        'Contrato sem comercial', 'O contrato não possui comercial vinculado.',
        'financeiro_fechamento_processos', v_fp_id
      ) ON CONFLICT DO NOTHING;
    END IF;

    IF v_valor = 0 THEN
      INSERT INTO financeiro_conferencias (
        empresa_id, fechamento_id, tipo, severidade, status, titulo, descricao,
        entidade_tipo, entidade_id
      ) VALUES (
        v_fechamento.empresa_id, p_fechamento_id, 'valor_negativo', 'critico', 'pendente',
        'Contrato sem valor', 'O campo valor_contrato está vazio ou zero. Verifique o processo.',
        'financeiro_fechamento_processos', v_fp_id
      ) ON CONFLICT DO NOTHING;
    END IF;

    v_count := v_count + 1;
  END LOOP;

  UPDATE financeiro_fechamentos
  SET status = 'em_conferencia', updated_at = now()
  WHERE id = p_fechamento_id AND status = 'rascunho';

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
