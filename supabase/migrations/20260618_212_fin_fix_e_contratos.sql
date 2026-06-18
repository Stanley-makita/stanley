-- Migration 212: Fix puxar_processos_emitidos + campo valor_contrato + RPC puxar_contratos

-- 1. Novo campo em processos para valor fixo de contratos/jurídico
ALTER TABLE processos
  ADD COLUMN IF NOT EXISTS valor_contrato NUMERIC(15,2);

-- ============================================================
-- 2. CORRIGIR puxar_processos_emitidos
--    Bug: LEFT JOIN clientes (tabela inexistente)
--    Fix: LEFT JOIN pessoas via pessoa_id
--    Extra: filtrar modalidade NOT IN ('Contrato', 'Consorcio')
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
      COALESCE(pe.nome, p.cliente_nome, '') AS cliente_nome,
      p.modalidade
    FROM processos p
    LEFT JOIN pessoas pe ON pe.id = p.pessoa_id
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
-- 3. NOVA RPC: puxar_contratos
--    Importa processos modalidade='Contrato' com status_emissao='emitido'
--    Comissão = valor fixo (valor_contrato) 100% para o comercial
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
      COALESCE(pe.nome, p.cliente_nome, '') AS cliente_nome,
      p.modalidade
    FROM processos p
    LEFT JOIN pessoas pe ON pe.id = p.pessoa_id
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

    -- Inserir snapshot do processo
    INSERT INTO financeiro_fechamento_processos (
      fechamento_id, empresa_id, processo_id, cliente_nome, banco_id, modalidade,
      valor_financiado, data_emissao, comercial_id, operacional_id, status_origem
    ) VALUES (
      p_fechamento_id, v_fechamento.empresa_id, v_proc.id, v_proc.cliente_nome,
      NULL, 'Contrato', v_valor, v_proc.data_emissao,
      v_proc.comercial_id, v_proc.juridico_id, v_proc.status_emissao
    )
    RETURNING id INTO v_fp_id;

    -- Conta a receber: valor direto (sem percentual)
    INSERT INTO financeiro_contas_receber (
      empresa_id, fechamento_id, processo_id, banco_id, cliente_nome, origem,
      valor_base, percentual_previsto, valor_previsto, status
    ) VALUES (
      v_fechamento.empresa_id, p_fechamento_id, v_proc.id, NULL, v_proc.cliente_nome,
      'contrato', v_valor, 0, v_valor,
      'a_faturar'
    );

    -- Comissão do comercial: 100% do valor_contrato
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

    -- Conferências
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

-- ============================================================
-- 4. ATUALIZAR gerar_comissoes_a_pagar
--    Pular processos de Contrato (comissão já gerada por puxar_contratos)
-- ============================================================
CREATE OR REPLACE FUNCTION gerar_comissoes_a_pagar(
  p_fechamento_id UUID
)
RETURNS INTEGER AS $$
DECLARE
  v_fechamento  RECORD;
  v_proc        RECORD;
  v_func        RECORD;
  v_faixa       RECORD;
  v_regra_id    UUID;
  v_pct         NUMERIC;
  v_valor       NUMERIC;
  v_count       INTEGER := 0;
BEGIN
  SELECT f.*
  INTO v_fechamento
  FROM financeiro_fechamentos f
  JOIN usuarios u ON u.id = auth.uid()
  WHERE f.id = p_fechamento_id AND f.empresa_id = u.empresa_id AND u.ativo = true;

  IF NOT FOUND THEN RAISE EXCEPTION 'Fechamento não encontrado ou acesso negado'; END IF;
  IF v_fechamento.status = 'travado' THEN RAISE EXCEPTION 'Fechamento travado'; END IF;

  -- Remover comissões auto-geradas de financiamentos (recálculo limpo)
  -- Preserva: contratos (percentual=100, regra_id IS NULL) e ajustes manuais (ajuste_manual != 0)
  DELETE FROM financeiro_comissoes_pagar
  WHERE fechamento_id = p_fechamento_id
    AND ajuste_manual = 0
    AND NOT (percentual = 100 AND regra_id IS NULL AND papel = 'comercial'
             AND processo_id IN (
               SELECT fp.processo_id FROM financeiro_fechamento_processos fp
               WHERE fp.fechamento_id = p_fechamento_id AND fp.modalidade = 'Contrato'
             ));

  FOR v_proc IN
    SELECT fp.*, cp.comissao_empresa, cp.comissao_comercial, cp.comissao_operacional, cp.comissao_parceiro
    FROM financeiro_fechamento_processos fp
    LEFT JOIN comissoes_padrao cp ON cp.banco_id = fp.banco_id AND cp.empresa_id = fp.empresa_id
    WHERE fp.fechamento_id = p_fechamento_id
  LOOP
    -- Pular contratos — comissão já gerada por puxar_contratos
    IF v_proc.modalidade = 'Contrato' THEN
      CONTINUE;
    END IF;

    -- === COMISSÃO COMERCIAL ===
    IF v_proc.comercial_id IS NOT NULL THEN
      SELECT f.*, c.regra_comissao_id
      INTO v_func
      FROM rh_funcionarios f
      LEFT JOIN rh_cargos c ON c.id = f.cargo_id
      WHERE f.empresa_id = v_fechamento.empresa_id
        AND f.email = (SELECT email FROM usuarios WHERE id = v_proc.comercial_id)
        AND f.status = 'ativo'
      LIMIT 1;

      v_regra_id := NULL;
      v_pct := COALESCE(v_proc.comissao_comercial, 0);

      IF FOUND AND v_func.regra_comissao_id IS NOT NULL THEN
        v_regra_id := v_func.regra_comissao_id;
        SELECT *
        INTO v_faixa
        FROM rh_faixas_comissao
        WHERE regra_id = v_regra_id
          AND valor_minimo <= COALESCE(v_proc.valor_financiado, 0)
          AND (valor_maximo = 0 OR valor_maximo >= COALESCE(v_proc.valor_financiado, 0))
        ORDER BY valor_minimo DESC
        LIMIT 1;

        IF FOUND THEN
          v_pct := COALESCE(v_faixa.pct_comercial, v_faixa.percentual, v_pct);
        END IF;
      END IF;

      v_valor := COALESCE(v_proc.valor_financiado, 0) * v_pct / 100;

      IF FOUND AND v_faixa.piso_valor > 0 THEN
        v_valor := GREATEST(v_valor, v_faixa.piso_valor);
      END IF;
      IF FOUND AND v_faixa.teto_valor > 0 THEN
        v_valor := LEAST(v_valor, v_faixa.teto_valor);
      END IF;

      IF v_valor > 0 THEN
        INSERT INTO financeiro_comissoes_pagar (
          empresa_id, fechamento_id, processo_id,
          usuario_id, funcionario_id, tipo_destinatario, papel, regra_id,
          valor_base, percentual, valor_calculado, status
        ) VALUES (
          v_fechamento.empresa_id, p_fechamento_id, v_proc.processo_id,
          v_proc.comercial_id,
          CASE WHEN v_func IS NOT NULL THEN v_func.id ELSE NULL END,
          CASE WHEN v_func IS NOT NULL THEN 'funcionario' ELSE 'usuario' END,
          'comercial', v_regra_id,
          COALESCE(v_proc.valor_financiado, 0), v_pct, v_valor, 'calculada'
        );
        v_count := v_count + 1;
      END IF;

      IF NOT FOUND THEN
        INSERT INTO financeiro_conferencias (
          empresa_id, fechamento_id, tipo, severidade, status, titulo, descricao,
          entidade_tipo, entidade_id
        ) VALUES (
          v_fechamento.empresa_id, p_fechamento_id, 'comissao_sem_funcionario', 'alerta', 'pendente',
          'Comercial não encontrado no RH',
          'O usuário comercial não possui cadastro ativo no módulo RH para aplicação de regra.',
          'financeiro_fechamento_processos', v_proc.id
        ) ON CONFLICT DO NOTHING;
      END IF;

      IF FOUND AND v_func.regra_comissao_id IS NULL THEN
        INSERT INTO financeiro_conferencias (
          empresa_id, fechamento_id, tipo, severidade, status, titulo, descricao,
          entidade_tipo, entidade_id
        ) VALUES (
          v_fechamento.empresa_id, p_fechamento_id, 'processo_sem_regra_comissao', 'alerta', 'pendente',
          'Sem regra de comissão',
          'O cargo do comercial não possui regra de comissão configurada. Usando percentual padrão do banco.',
          'financeiro_fechamento_processos', v_proc.id
        ) ON CONFLICT DO NOTHING;
      END IF;
    END IF;

    -- === COMISSÃO OPERACIONAL ===
    IF v_proc.operacional_id IS NOT NULL AND COALESCE(v_proc.comissao_operacional, 0) > 0 THEN
      v_valor := COALESCE(v_proc.valor_financiado, 0) * COALESCE(v_proc.comissao_operacional, 0) / 100;

      IF v_valor > 0 THEN
        INSERT INTO financeiro_comissoes_pagar (
          empresa_id, fechamento_id, processo_id,
          usuario_id, tipo_destinatario, papel,
          valor_base, percentual, valor_calculado, status
        ) VALUES (
          v_fechamento.empresa_id, p_fechamento_id, v_proc.processo_id,
          v_proc.operacional_id, 'usuario', 'operacional',
          COALESCE(v_proc.valor_financiado, 0),
          COALESCE(v_proc.comissao_operacional, 0),
          v_valor, 'calculada'
        );
        v_count := v_count + 1;
      END IF;
    END IF;

    -- === COMISSÃO PARCEIRO ===
    IF COALESCE(v_proc.comissao_parceiro, 0) > 0 THEN
      v_valor := COALESCE(v_proc.valor_financiado, 0) * COALESCE(v_proc.comissao_parceiro, 0) / 100;

      IF v_valor > 0 THEN
        INSERT INTO financeiro_comissoes_pagar (
          empresa_id, fechamento_id, processo_id,
          tipo_destinatario, papel,
          valor_base, percentual, valor_calculado, status
        ) VALUES (
          v_fechamento.empresa_id, p_fechamento_id, v_proc.processo_id,
          'externo', 'parceiro',
          COALESCE(v_proc.valor_financiado, 0),
          COALESCE(v_proc.comissao_parceiro, 0),
          v_valor, 'calculada'
        );
        v_count := v_count + 1;
      END IF;
    END IF;

  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
