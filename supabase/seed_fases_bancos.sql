-- ============================================================
-- SEED: Fases e Bancos para a empresa Fontinhas Assessoria
-- Rodar no Supabase SQL Editor (role: postgres)
-- ============================================================

-- Busca o ID da empresa para usar nas inserções
DO $$
DECLARE
  v_empresa_id uuid;
BEGIN
  SELECT id INTO v_empresa_id FROM empresas WHERE nome ILIKE '%Fontinhas%' LIMIT 1;

  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'Empresa não encontrada. Execute fix_rls_bootstrap.sql primeiro.';
  END IF;

  -- Inserir fases do módulo Processos (pipeline operacional)
  INSERT INTO fases (empresa_id, nome, cor, ordem, modulo, ativo)
  VALUES
    (v_empresa_id, 'Prospecção',     '#94a3b8', 1, 'processos', true),
    (v_empresa_id, 'Simulação',      '#60a5fa', 2, 'processos', true),
    (v_empresa_id, 'Documentação',   '#f59e0b', 3, 'processos', true),
    (v_empresa_id, 'Em análise',     '#a78bfa', 4, 'processos', true),
    (v_empresa_id, 'Aprovado',       '#34d399', 5, 'processos', true),
    (v_empresa_id, 'Em contratação', '#C2AA6A', 6, 'processos', true),
    (v_empresa_id, 'Concluído',      '#253B29', 7, 'processos', true)
  ON CONFLICT (empresa_id, modulo, nome) DO UPDATE SET
    cor   = EXCLUDED.cor,
    ordem = EXCLUDED.ordem,
    ativo = true;

  -- Inserir fases do módulo Leads (funil de captação)
  INSERT INTO fases (empresa_id, nome, cor, ordem, modulo, ativo)
  VALUES
    (v_empresa_id, 'Novo',                '#94a3b8', 1, 'leads', true),
    (v_empresa_id, 'Atendimento iniciado', '#60a5fa', 2, 'leads', true),
    (v_empresa_id, 'Documentação',         '#f59e0b', 3, 'leads', true),
    (v_empresa_id, 'Simulação',            '#a78bfa', 4, 'leads', true),
    (v_empresa_id, 'Análise de Crédito',   '#34d399', 5, 'leads', true),
    (v_empresa_id, 'Concluído',            '#253B29', 6, 'leads', true)
  ON CONFLICT (empresa_id, modulo, nome) DO NOTHING;

  -- Inserir bancos (todos os 8)
  INSERT INTO bancos (empresa_id, nome, ativo)
  VALUES
    (v_empresa_id, 'Caixa Econômica Federal', true),
    (v_empresa_id, 'Banco do Brasil',         true),
    (v_empresa_id, 'Bradesco',                true),
    (v_empresa_id, 'Itaú',                    true),
    (v_empresa_id, 'Santander',               true),
    (v_empresa_id, 'Safra',                   true),
    (v_empresa_id, 'Inter',                   true),
    (v_empresa_id, 'Sicoob',                  true)
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Seed concluído para empresa_id: %', v_empresa_id;
END $$;

-- Verificação
SELECT 'fases' AS tabela, count(*) AS registros FROM fases WHERE ativo = true
UNION ALL
SELECT 'bancos', count(*) FROM bancos WHERE ativo = true;
