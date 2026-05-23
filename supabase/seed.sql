-- ============================================================
-- Seed: Credifon CRM — Fontinhas Assessoria
-- INSTRUÇÕES:
-- 1. Primeiro crie a empresa e o admin via Edge Function (onboarding)
--    ou pelo Supabase Dashboard diretamente
-- 2. Substitua {EMPRESA_ID} pelo UUID real da empresa
-- 3. Execute este seed via SQL Editor no Supabase Dashboard
-- ============================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM empresas LIMIT 1) THEN
    RAISE EXCEPTION 'Crie a empresa primeiro antes de rodar este seed.';
  END IF;
END $$;

-- Obtenha o empresa_id:
-- SELECT id FROM empresas LIMIT 1;

-- Substitua {EMPRESA_ID} abaixo:
-- DO $$ DECLARE v_empresa_id UUID := '{EMPRESA_ID}'; BEGIN

-- Fases padrão do processo de financiamento imobiliário
-- INSERT INTO fases (empresa_id, nome, descricao, ordem, cor, prazo_dias) VALUES
--   (v_empresa_id, 'Pré-Análise',      'Verificação inicial do perfil de crédito',    1, '#6B7280', 2),
--   (v_empresa_id, 'Simulação',         'Opções de financiamento disponíveis',         2, '#8B5CF6', 3),
--   (v_empresa_id, 'Documentação',      'Coleta e análise dos documentos',             3, '#F59E0B', 7),
--   (v_empresa_id, 'Análise Bancária',  'Processo em análise pelo banco parceiro',     4, '#3B82F6', 10),
--   (v_empresa_id, 'Avaliação Imóvel',  'Vistoria e avaliação técnica pelo banco',     5, '#10B981', 5),
--   (v_empresa_id, 'Aprovado',          'Crédito aprovado — aguardando assinatura',    6, '#253B29', 3),
--   (v_empresa_id, 'Assinatura',        'Assinatura do contrato e formalização',       7, '#C2AA6A', 5),
--   (v_empresa_id, 'Registro',          'Registro do imóvel em cartório',              8, '#6366F1', 15),
--   (v_empresa_id, 'Liberado',          'Processo finalizado — crédito liberado',      9, '#059669', NULL),
--   (v_empresa_id, 'Cancelado',         'Processo cancelado',                          10, '#EF4444', NULL);

-- Bancos parceiros
-- INSERT INTO bancos (empresa_id, nome, codigo, taxa_minima, taxa_maxima, prazo_maximo) VALUES
--   (v_empresa_id, 'Caixa Econômica Federal', '104', 8.160, 12.500, 420),
--   (v_empresa_id, 'Banco do Brasil',         '001', 8.520, 13.200, 360),
--   (v_empresa_id, 'Bradesco',                '237', 9.490, 14.100, 360),
--   (v_empresa_id, 'Itaú',                    '341', 9.290, 13.900, 360),
--   (v_empresa_id, 'Santander',               '033', 9.490, 14.200, 360),
--   (v_empresa_id, 'Banco Inter',             '077', 8.990, 13.500, 360),
--   (v_empresa_id, 'Sicoob',                  '756', 8.490, 12.900, 360);

-- END $$;
