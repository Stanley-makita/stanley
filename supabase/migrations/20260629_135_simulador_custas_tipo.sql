-- Simplifica estrutura de tarifas por banco:
-- Substitui tarifa_avaliacao/correspondente/outros por tipo+valor
-- tipo: 'residencial' | 'comercial'
-- valor: tarifa única de contratação

-- 1. Adiciona colunas novas
ALTER TABLE simulador_custas_config
  ADD COLUMN IF NOT EXISTS tipo  TEXT           NOT NULL DEFAULT 'residencial',
  ADD COLUMN IF NOT EXISTS valor NUMERIC(12,2)  NOT NULL DEFAULT 0;

-- 2. Migra dados existentes: valor = tarifa_avaliacao (era o único campo usado)
UPDATE simulador_custas_config
  SET valor = tarifa_avaliacao
  WHERE valor = 0 AND tarifa_avaliacao > 0;

-- 3. Remove entradas duplicadas para a mesma combinação banco+tipo antes de criar unique
--    Mantém o registro mais recente por (empresa_id, banco_nome, tipo)
DELETE FROM simulador_custas_config a
  USING simulador_custas_config b
  WHERE a.id < b.id
    AND a.empresa_id = b.empresa_id
    AND a.banco_nome = b.banco_nome
    AND a.tipo = b.tipo;

-- 4. Unique constraint
ALTER TABLE simulador_custas_config
  DROP CONSTRAINT IF EXISTS sim_custas_unique_banco_tipo;
ALTER TABLE simulador_custas_config
  ADD CONSTRAINT sim_custas_unique_banco_tipo UNIQUE (empresa_id, banco_nome, tipo);

-- 5. Seed: valores iniciais por empresa
DO $$
DECLARE
  v_empresa_id uuid;
BEGIN
  FOR v_empresa_id IN SELECT id FROM empresas LOOP
    INSERT INTO simulador_custas_config (empresa_id, banco_nome, tipo, valor, ativo)
    VALUES
      (v_empresa_id, 'Itaú',                    'residencial', 1950.00,   true),
      (v_empresa_id, 'Santander',                'residencial', 1950.00,   true),
      (v_empresa_id, 'Santander',                'comercial',   3300.00,   true),
      (v_empresa_id, 'Bradesco',                 'residencial', 2114.03,   true),
      (v_empresa_id, 'Bradesco',                 'comercial',   3400.00,   true),
      (v_empresa_id, 'Banco do Brasil',          'residencial', 1940.00,   true),
      (v_empresa_id, 'Caixa Econômica Federal',  'residencial', 3600.00,   true),
      (v_empresa_id, 'Inter',                    'residencial', 5000.00,   true)
    ON CONFLICT (empresa_id, banco_nome, tipo) DO UPDATE
      SET valor = EXCLUDED.valor,
          ativo = true;
  END LOOP;
END $$;
