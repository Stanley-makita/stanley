-- Migration 210: RPCs do fluxo de fechamento

-- ============================================================
-- RPC: abrir_fechamento
-- Cria o fechamento do mês e importa despesas recorrentes
-- ============================================================
CREATE OR REPLACE FUNCTION abrir_fechamento(
  p_empresa_id  UUID,
  p_mes         INTEGER,
  p_ano         INTEGER
)
RETURNS UUID AS $$
DECLARE
  v_fechamento_id UUID;
  v_rec           RECORD;
  v_data_venc     DATE;
BEGIN
  -- Verificar se usuário pertence à empresa
  IF NOT EXISTS (
    SELECT 1 FROM usuarios WHERE id = auth.uid() AND empresa_id = p_empresa_id AND ativo = true
  ) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  -- Verificar se já existe fechamento para o mês
  IF EXISTS (
    SELECT 1 FROM financeiro_fechamentos
    WHERE empresa_id = p_empresa_id AND competencia_ano = p_ano AND competencia_mes = p_mes
  ) THEN
    RAISE EXCEPTION 'Já existe um fechamento para %/%. Use o fechamento existente.', p_mes, p_ano;
  END IF;

  -- Criar fechamento
  INSERT INTO financeiro_fechamentos (empresa_id, competencia_mes, competencia_ano, status)
  VALUES (p_empresa_id, p_mes, p_ano, 'rascunho')
  RETURNING id INTO v_fechamento_id;

  -- Importar despesas recorrentes ativas para o mês
  FOR v_rec IN
    SELECT *
    FROM financeiro_despesas_recorrentes
    WHERE empresa_id = p_empresa_id
      AND ativa = true
      AND data_inicio <= make_date(p_ano, p_mes, 1)
      AND (data_fim IS NULL OR data_fim >= make_date(p_ano, p_mes, 1))
  LOOP
    -- Calcular data de vencimento com base no dia configurado
    BEGIN
      v_data_venc := make_date(p_ano, p_mes, LEAST(v_rec.dia_vencimento, 28));
    EXCEPTION WHEN OTHERS THEN
      v_data_venc := (make_date(p_ano, p_mes, 1) + INTERVAL '1 month - 1 day')::DATE;
    END;

    INSERT INTO financeiro_despesas (
      empresa_id, fechamento_id, tipo, categoria, fornecedor, descricao,
      valor, data_vencimento, status, recorrente_id
    ) VALUES (
      p_empresa_id, v_fechamento_id, 'recorrente', v_rec.categoria, v_rec.fornecedor,
      v_rec.descricao, COALESCE(v_rec.valor_padrao, 0), v_data_venc, 'prevista', v_rec.id
    );
  END LOOP;

  RETURN v_fechamento_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- RPC: puxar_processos_emitidos
-- Importa processos emitidos da competência para o fechamento
-- ============================================================
CREATE OR REPLACE FUNCTION puxar_processos_emitidos(
  p_fechamento_id UUID
)
RETURNS INTEGER AS $$
DECLARE
  v_fechamento    RECORD;
  v_proc          RECORD;
  v_padrao        RECORD;
  v_pct_empresa   NUMERIC;
  v_count         INTEGER := 0;
BEGIN
  -- Carregar fechamento
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

  -- Iterar processos emitidos do mês (status_emissao = 'emitido' + competência)
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
      COALESCE(c.nome, p.cliente_nome, '') AS cliente_nome,
      p.modalidade
    FROM processos p
    LEFT JOIN clientes c ON c.id = p.cliente_id
    WHERE p.empresa_id = v_fechamento.empresa_id
      AND p.status_emissao = 'emitido'
      AND EXTRACT(MONTH FROM p.data_emissao) = v_fechamento.competencia_mes
      AND EXTRACT(YEAR  FROM p.data_emissao) = v_fechamento.competencia_ano
      AND NOT EXISTS (
        SELECT 1 FROM financeiro_fechamento_processos fp
        WHERE fp.processo_id = p.id AND fp.fechamento_id = p_fechamento_id
      )
  LOOP
    -- Buscar percentual de comissão empresa por banco
    SELECT COALESCE(cp.comissao_empresa, 0)
    INTO v_pct_empresa
    FROM comissoes_padrao cp
    WHERE cp.empresa_id = v_fechamento.empresa_id AND cp.banco_id = v_proc.banco_id
    LIMIT 1;

    IF NOT FOUND THEN v_pct_empresa := 0; END IF;

    -- Inserir em fechamento_processos
    INSERT INTO financeiro_fechamento_processos (
      fechamento_id, empresa_id, processo_id, cliente_nome, banco_id, modalidade,
      valor_financiado, data_emissao, comercial_id, operacional_id, status_origem
    ) VALUES (
      p_fechamento_id, v_fechamento.empresa_id, v_proc.id, v_proc.cliente_nome,
      v_proc.banco_id, v_proc.modalidade, v_proc.valor_financiado, v_proc.data_emissao,
      v_proc.comercial_id, v_proc.operacional_id, v_proc.status_emissao
    );

    -- Gerar conta a receber
    INSERT INTO financeiro_contas_receber (
      empresa_id, fechamento_id, processo_id, banco_id, cliente_nome, origem,
      valor_base, percentual_previsto, valor_previsto, status
    ) VALUES (
      v_fechamento.empresa_id, p_fechamento_id, v_proc.id, v_proc.banco_id, v_proc.cliente_nome,
      'emissao', COALESCE(v_proc.valor_financiado, 0), v_pct_empresa,
      COALESCE(v_proc.valor_financiado, 0) * v_pct_empresa / 100,
      'a_faturar'
    );

    -- Conferências iniciais
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

  -- Atualizar status do fechamento
  UPDATE financeiro_fechamentos
  SET status = 'em_conferencia', updated_at = now()
  WHERE id = p_fechamento_id AND status = 'rascunho';

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- RPC: gerar_comissoes_a_pagar
-- Calcula comissões por papel para cada processo do fechamento
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

  -- Remover comissões auto-geradas anteriores (recalculo limpo)
  DELETE FROM financeiro_comissoes_pagar
  WHERE fechamento_id = p_fechamento_id AND ajuste_manual = 0;

  FOR v_proc IN
    SELECT fp.*, cp.comissao_empresa, cp.comissao_comercial, cp.comissao_operacional, cp.comissao_parceiro
    FROM financeiro_fechamento_processos fp
    LEFT JOIN comissoes_padrao cp ON cp.banco_id = fp.banco_id AND cp.empresa_id = fp.empresa_id
    WHERE fp.fechamento_id = p_fechamento_id
  LOOP
    -- === COMISSÃO COMERCIAL ===
    IF v_proc.comercial_id IS NOT NULL THEN
      -- Buscar funcionário pelo usuario_id
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
        -- Buscar faixa aplicável
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

      -- Aplicar piso/teto
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

      -- Conferência: comercial sem funcionário no RH
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

      -- Conferência: sem regra de comissão
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
          COALESCE(v_proc.valor_financiado, 0), COALESCE(v_proc.comissao_operacional, 0),
          v_valor, 'calculada'
        );
        v_count := v_count + 1;
      END IF;
    END IF;

  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- RPC: gerar_folha
-- Cria folha mensal a partir dos funcionários ativos
-- ============================================================
CREATE OR REPLACE FUNCTION gerar_folha(
  p_fechamento_id UUID
)
RETURNS UUID AS $$
DECLARE
  v_fechamento  RECORD;
  v_folha_id    UUID;
  v_func        RECORD;
  v_com_total   NUMERIC;
  v_com_com     NUMERIC;
BEGIN
  SELECT f.*
  INTO v_fechamento
  FROM financeiro_fechamentos f
  JOIN usuarios u ON u.id = auth.uid()
  WHERE f.id = p_fechamento_id AND f.empresa_id = u.empresa_id AND u.ativo = true;

  IF NOT FOUND THEN RAISE EXCEPTION 'Fechamento não encontrado ou acesso negado'; END IF;
  IF v_fechamento.status = 'travado' THEN RAISE EXCEPTION 'Fechamento travado'; END IF;

  -- Criar ou recuperar folha
  INSERT INTO financeiro_folhas (empresa_id, fechamento_id, competencia_mes, competencia_ano, status)
  VALUES (v_fechamento.empresa_id, p_fechamento_id, v_fechamento.competencia_mes, v_fechamento.competencia_ano, 'rascunho')
  ON CONFLICT (empresa_id, competencia_ano, competencia_mes) DO UPDATE
    SET fechamento_id = EXCLUDED.fechamento_id, updated_at = now()
  RETURNING id INTO v_folha_id;

  -- Inserir item por funcionário ativo
  FOR v_func IN
    SELECT f.*, c.nivel_comissao
    FROM rh_funcionarios f
    LEFT JOIN rh_cargos c ON c.id = f.cargo_id
    WHERE f.empresa_id = v_fechamento.empresa_id AND f.status = 'ativo'
  LOOP
    -- Somar comissões geradas para este funcionário no fechamento
    SELECT
      COALESCE(SUM(valor_final) FILTER (WHERE papel = 'comercial'), 0),
      COALESCE(SUM(valor_final), 0)
    INTO v_com_com, v_com_total
    FROM financeiro_comissoes_pagar
    WHERE fechamento_id = p_fechamento_id AND funcionario_id = v_func.id;

    INSERT INTO financeiro_folha_itens (
      empresa_id, folha_id, funcionario_id,
      salario_base, comissao_comercial, comissao_contratos, total_liquido
    ) VALUES (
      v_fechamento.empresa_id, v_folha_id, v_func.id,
      COALESCE(v_func.salario_base, 0),
      v_com_com,
      v_com_total - v_com_com,
      COALESCE(v_func.salario_base, 0) + v_com_total
    )
    ON CONFLICT (folha_id, funcionario_id) DO UPDATE SET
      salario_base       = EXCLUDED.salario_base,
      comissao_comercial = EXCLUDED.comissao_comercial,
      comissao_contratos = EXCLUDED.comissao_contratos,
      total_liquido      = EXCLUDED.total_liquido,
      updated_at         = now();
  END LOOP;

  -- Atualizar totais da folha
  UPDATE financeiro_folhas
  SET
    total_salarios  = (SELECT COALESCE(SUM(salario_base), 0) FROM financeiro_folha_itens WHERE folha_id = v_folha_id),
    total_comissoes = (SELECT COALESCE(SUM(comissao_comercial + comissao_contratos), 0) FROM financeiro_folha_itens WHERE folha_id = v_folha_id),
    total_beneficios = (SELECT COALESCE(SUM(vale_transporte + vale_alimentacao + unimed), 0) FROM financeiro_folha_itens WHERE folha_id = v_folha_id),
    total_descontos = (SELECT COALESCE(SUM(descontos + outros_debitos), 0) FROM financeiro_folha_itens WHERE folha_id = v_folha_id),
    total_liquido   = (SELECT COALESCE(SUM(total_liquido), 0) FROM financeiro_folha_itens WHERE folha_id = v_folha_id),
    updated_at      = now()
  WHERE id = v_folha_id;

  RETURN v_folha_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- RPC: executar_conferencias
-- Executa/atualiza todas as conferências automáticas
-- ============================================================
CREATE OR REPLACE FUNCTION executar_conferencias(
  p_fechamento_id UUID
)
RETURNS INTEGER AS $$
DECLARE
  v_fechamento  RECORD;
  v_count       INTEGER := 0;
BEGIN
  SELECT f.*
  INTO v_fechamento
  FROM financeiro_fechamentos f
  JOIN usuarios u ON u.id = auth.uid()
  WHERE f.id = p_fechamento_id AND f.empresa_id = u.empresa_id AND u.ativo = true;

  IF NOT FOUND THEN RAISE EXCEPTION 'Fechamento não encontrado ou acesso negado'; END IF;

  -- 1. Contas a receber sem NF
  INSERT INTO financeiro_conferencias (
    empresa_id, fechamento_id, tipo, severidade, status, titulo, descricao,
    entidade_tipo, entidade_id
  )
  SELECT
    v_fechamento.empresa_id, p_fechamento_id,
    'conta_receber_sem_nf', 'alerta', 'pendente',
    'Conta a receber sem nota fiscal',
    'Conta a receber de ' || COALESCE(cr.cliente_nome, 'cliente') || ' sem NF emitida.',
    'financeiro_contas_receber', cr.id
  FROM financeiro_contas_receber cr
  WHERE cr.fechamento_id = p_fechamento_id
    AND cr.status = 'a_faturar'
    AND NOT EXISTS (
      SELECT 1 FROM financeiro_notas_fiscais nf
      WHERE nf.conta_receber_id = cr.id AND nf.status = 'emitida'
    )
  ON CONFLICT DO NOTHING;

  -- 2. Recebimento divergente (valor_recebido > valor_previsto + 5%)
  INSERT INTO financeiro_conferencias (
    empresa_id, fechamento_id, tipo, severidade, status, titulo, descricao,
    entidade_tipo, entidade_id
  )
  SELECT
    v_fechamento.empresa_id, p_fechamento_id,
    'recebimento_divergente', 'critico', 'pendente',
    'Recebimento acima do previsto',
    'Valor recebido (' || cr.valor_recebido || ') supera valor previsto (' || cr.valor_previsto || ').',
    'financeiro_contas_receber', cr.id
  FROM financeiro_contas_receber cr
  WHERE cr.fechamento_id = p_fechamento_id
    AND cr.valor_recebido > cr.valor_previsto * 1.05
  ON CONFLICT DO NOTHING;

  -- 3. Despesas vencidas não pagas
  INSERT INTO financeiro_conferencias (
    empresa_id, fechamento_id, tipo, severidade, status, titulo, descricao,
    entidade_tipo, entidade_id
  )
  SELECT
    v_fechamento.empresa_id, p_fechamento_id,
    'despesa_vencida', 'critico', 'pendente',
    'Despesa vencida não paga',
    d.descricao || ' — venceu em ' || d.data_vencimento,
    'financeiro_despesas', d.id
  FROM financeiro_despesas d
  WHERE d.fechamento_id = p_fechamento_id
    AND d.data_vencimento < CURRENT_DATE
    AND d.status NOT IN ('paga', 'cancelada')
  ON CONFLICT DO NOTHING;

  -- 4. Folha incompleta (funcionário sem salário base)
  INSERT INTO financeiro_conferencias (
    empresa_id, fechamento_id, tipo, severidade, status, titulo, descricao,
    entidade_tipo, entidade_id
  )
  SELECT
    v_fechamento.empresa_id, p_fechamento_id,
    'folha_incompleta', 'info', 'pendente',
    'Item de folha sem salário',
    'Funcionário ' || f.nome || ' tem salário base zerado na folha.',
    'financeiro_folha_itens', fi.id
  FROM financeiro_folha_itens fi
  JOIN rh_funcionarios f ON f.id = fi.funcionario_id
  JOIN financeiro_folhas fl ON fl.id = fi.folha_id
  WHERE fl.fechamento_id = p_fechamento_id AND fi.salario_base = 0
  ON CONFLICT DO NOTHING;

  -- 5. Valores negativos em comissões
  INSERT INTO financeiro_conferencias (
    empresa_id, fechamento_id, tipo, severidade, status, titulo, descricao,
    entidade_tipo, entidade_id
  )
  SELECT
    v_fechamento.empresa_id, p_fechamento_id,
    'valor_negativo', 'critico', 'pendente',
    'Comissão com valor final negativo',
    'Comissão para ' || COALESCE((SELECT nome FROM rh_funcionarios WHERE id = cp.funcionario_id), 'destinatário') || ' resultou em valor negativo.',
    'financeiro_comissoes_pagar', cp.id
  FROM financeiro_comissoes_pagar cp
  WHERE cp.fechamento_id = p_fechamento_id AND cp.valor_final < 0
  ON CONFLICT DO NOTHING;

  -- 6. Regras expiradas usadas
  INSERT INTO financeiro_conferencias (
    empresa_id, fechamento_id, tipo, severidade, status, titulo, descricao,
    entidade_tipo, entidade_id
  )
  SELECT
    v_fechamento.empresa_id, p_fechamento_id,
    'regra_expirada', 'alerta', 'pendente',
    'Regra de comissão expirada',
    'A regra "' || r.nome || '" estava expirada na data de apuração.',
    'financeiro_comissoes_pagar', cp.id
  FROM financeiro_comissoes_pagar cp
  JOIN rh_regras_comissao r ON r.id = cp.regra_id
  WHERE cp.fechamento_id = p_fechamento_id
    AND r.data_termino IS NOT NULL
    AND r.data_termino < make_date(v_fechamento.competencia_ano, v_fechamento.competencia_mes, 1)
  ON CONFLICT DO NOTHING;

  SELECT COUNT(*) INTO v_count FROM financeiro_conferencias
  WHERE fechamento_id = p_fechamento_id AND status = 'pendente';

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- RPC: aprovar_fechamento
-- ============================================================
CREATE OR REPLACE FUNCTION aprovar_fechamento(
  p_fechamento_id UUID
)
RETURNS VOID AS $$
DECLARE
  v_fechamento  RECORD;
  v_pendentes   INTEGER;
BEGIN
  SELECT f.*
  INTO v_fechamento
  FROM financeiro_fechamentos f
  JOIN usuarios u ON u.id = auth.uid()
  WHERE f.id = p_fechamento_id AND f.empresa_id = u.empresa_id AND u.ativo = true;

  IF NOT FOUND THEN RAISE EXCEPTION 'Fechamento não encontrado ou acesso negado'; END IF;
  IF v_fechamento.status = 'travado' THEN RAISE EXCEPTION 'Fechamento já travado'; END IF;
  IF v_fechamento.status = 'aprovado' THEN RAISE EXCEPTION 'Fechamento já aprovado'; END IF;

  -- Verificar conferências pendentes
  SELECT COUNT(*) INTO v_pendentes
  FROM financeiro_conferencias
  WHERE fechamento_id = p_fechamento_id AND status = 'pendente' AND severidade = 'critico';

  IF v_pendentes > 0 THEN
    RAISE EXCEPTION 'Existem % conferência(s) crítica(s) pendente(s). Resolva antes de aprovar.', v_pendentes;
  END IF;

  UPDATE financeiro_fechamentos
  SET
    status       = 'aprovado',
    aprovado_em  = now(),
    aprovado_por = auth.uid(),
    updated_at   = now()
  WHERE id = p_fechamento_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- RPC: travar_fechamento
-- ============================================================
CREATE OR REPLACE FUNCTION travar_fechamento(
  p_fechamento_id UUID
)
RETURNS VOID AS $$
DECLARE
  v_fechamento RECORD;
BEGIN
  SELECT f.*
  INTO v_fechamento
  FROM financeiro_fechamentos f
  JOIN usuarios u ON u.id = auth.uid()
  WHERE f.id = p_fechamento_id AND f.empresa_id = u.empresa_id AND u.ativo = true;

  IF NOT FOUND THEN RAISE EXCEPTION 'Fechamento não encontrado ou acesso negado'; END IF;
  IF v_fechamento.status = 'travado' THEN RAISE EXCEPTION 'Fechamento já travado'; END IF;
  IF v_fechamento.status NOT IN ('aprovado', 'pago') THEN
    RAISE EXCEPTION 'Fechamento precisa estar aprovado ou pago antes de ser travado';
  END IF;

  UPDATE financeiro_fechamentos
  SET status = 'travado', travado_em = now(), updated_at = now()
  WHERE id = p_fechamento_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- RPC: reabrir_fechamento
-- ============================================================
CREATE OR REPLACE FUNCTION reabrir_fechamento(
  p_fechamento_id UUID,
  p_motivo        TEXT
)
RETURNS VOID AS $$
DECLARE
  v_fechamento RECORD;
BEGIN
  IF p_motivo IS NULL OR trim(p_motivo) = '' THEN
    RAISE EXCEPTION 'Motivo de reabertura é obrigatório';
  END IF;

  SELECT f.*
  INTO v_fechamento
  FROM financeiro_fechamentos f
  JOIN usuarios u ON u.id = auth.uid()
  WHERE f.id = p_fechamento_id AND f.empresa_id = u.empresa_id AND u.ativo = true;

  IF NOT FOUND THEN RAISE EXCEPTION 'Fechamento não encontrado ou acesso negado'; END IF;
  IF v_fechamento.status != 'travado' THEN RAISE EXCEPTION 'Somente fechamentos travados podem ser reabertos'; END IF;

  -- Registrar no log de ajustes
  INSERT INTO financeiro_ajustes (
    empresa_id, fechamento_id, entidade_tipo, entidade_id,
    tipo_ajuste, valor_anterior, valor_novo, motivo, criado_por
  ) VALUES (
    v_fechamento.empresa_id, p_fechamento_id,
    'financeiro_fechamentos', p_fechamento_id,
    'status', 'travado', 'reaberto', p_motivo, auth.uid()
  );

  UPDATE financeiro_fechamentos
  SET status = 'reaberto', travado_em = NULL, updated_at = now()
  WHERE id = p_fechamento_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
