-- Migration 216: Fix "record v_faixa is not assigned yet" em gerar_comissoes_a_pagar
-- Bug: v_faixa.piso_valor e teto_valor eram lidos fora do bloco que atribui v_faixa,
-- usando FOUND de um SELECT anterior (v_func), causando o erro quando o funcionário
-- existe mas não tem regra de comissão vinculada ao cargo.
-- Fix: usar flag booleana v_faixa_found em vez de FOUND para controlar o acesso a v_faixa.

CREATE OR REPLACE FUNCTION gerar_comissoes_a_pagar(
  p_fechamento_id UUID
)
RETURNS INTEGER AS $$
DECLARE
  v_fechamento    RECORD;
  v_proc          RECORD;
  v_func          RECORD;
  v_faixa         RECORD;
  v_regra_id      UUID;
  v_pct           NUMERIC;
  v_valor         NUMERIC;
  v_count         INTEGER := 0;
  v_func_found    BOOLEAN;
  v_faixa_found   BOOLEAN;
BEGIN
  SELECT f.*
  INTO v_fechamento
  FROM financeiro_fechamentos f
  JOIN usuarios u ON u.id = auth.uid()
  WHERE f.id = p_fechamento_id AND f.empresa_id = u.empresa_id AND u.ativo = true;

  IF NOT FOUND THEN RAISE EXCEPTION 'Fechamento não encontrado ou acesso negado'; END IF;
  IF v_fechamento.status = 'travado' THEN RAISE EXCEPTION 'Fechamento travado'; END IF;

  -- Remove comissões auto-geradas de financiamentos (recálculo limpo)
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
      v_func_found  := false;
      v_faixa_found := false;
      v_regra_id    := NULL;
      v_pct         := COALESCE(v_proc.comissao_comercial, 0);

      SELECT f.*, c.regra_comissao_id
      INTO v_func
      FROM rh_funcionarios f
      LEFT JOIN rh_cargos c ON c.id = f.cargo_id
      WHERE f.empresa_id = v_fechamento.empresa_id
        AND f.email = (SELECT email FROM usuarios WHERE id = v_proc.comercial_id)
        AND f.status = 'ativo'
      LIMIT 1;

      v_func_found := FOUND;

      IF v_func_found AND v_func.regra_comissao_id IS NOT NULL THEN
        v_regra_id := v_func.regra_comissao_id;

        SELECT *
        INTO v_faixa
        FROM rh_faixas_comissao
        WHERE regra_id = v_regra_id
          AND valor_minimo <= COALESCE(v_proc.valor_financiado, 0)
          AND (valor_maximo = 0 OR valor_maximo >= COALESCE(v_proc.valor_financiado, 0))
        ORDER BY valor_minimo DESC
        LIMIT 1;

        v_faixa_found := FOUND;

        IF v_faixa_found THEN
          v_pct := COALESCE(v_faixa.pct_comercial, v_faixa.percentual, v_pct);
        END IF;
      END IF;

      v_valor := COALESCE(v_proc.valor_financiado, 0) * v_pct / 100;

      -- Piso e teto só se a faixa foi encontrada
      IF v_faixa_found AND v_faixa.piso_valor > 0 THEN
        v_valor := GREATEST(v_valor, v_faixa.piso_valor);
      END IF;
      IF v_faixa_found AND v_faixa.teto_valor > 0 THEN
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
          CASE WHEN v_func_found THEN v_func.id ELSE NULL END,
          CASE WHEN v_func_found THEN 'funcionario' ELSE 'usuario' END,
          'comercial', v_regra_id,
          COALESCE(v_proc.valor_financiado, 0), v_pct, v_valor, 'calculada'
        );
        v_count := v_count + 1;
      END IF;

      IF NOT v_func_found THEN
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

      IF v_func_found AND v_func.regra_comissao_id IS NULL THEN
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
