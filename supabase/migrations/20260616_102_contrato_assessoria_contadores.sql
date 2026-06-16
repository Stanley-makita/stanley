-- =============================================================================
-- MIGRATION 102 — Contador de contratos de assessoria por empresa
-- =============================================================================

CREATE TABLE IF NOT EXISTS contrato_assessoria_contadores (
  empresa_id   UUID     NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  ultimo_seq   INTEGER  NOT NULL DEFAULT 0,
  ano          INTEGER  NOT NULL DEFAULT EXTRACT(YEAR FROM now())::INTEGER,
  PRIMARY KEY (empresa_id, ano)
);

ALTER TABLE contrato_assessoria_contadores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_only" ON contrato_assessoria_contadores
  USING (false);

-- Inicializar com último seq 77 (último contrato emitido foi 77/2026)
-- para que o próximo número gerado seja 78/2026
INSERT INTO contrato_assessoria_contadores (empresa_id, ultimo_seq, ano)
SELECT id, 77, 2026
FROM empresas
ON CONFLICT (empresa_id, ano) DO NOTHING;

-- ---------------------------------------------------------------------------
-- RPC: prévia do próximo número (NÃO incrementa)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION previa_numero_contrato_assessoria(p_empresa_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_seq INTEGER;
  v_ano INTEGER;
BEGIN
  v_ano := EXTRACT(YEAR FROM now())::INTEGER;

  SELECT ultimo_seq INTO v_seq
  FROM contrato_assessoria_contadores
  WHERE empresa_id = p_empresa_id AND ano = v_ano;

  IF v_seq IS NULL THEN
    v_seq := 77;
  END IF;

  RETURN (v_seq + 1)::TEXT || '/' || v_ano::TEXT;
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC: gerar número definitivo (incrementa e retorna)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION gerar_numero_contrato_assessoria(p_empresa_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_seq INTEGER;
  v_ano INTEGER;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM usuarios
    WHERE id = auth.uid()
      AND empresa_id = p_empresa_id
      AND ativo = true
  ) THEN
    RAISE EXCEPTION 'Acesso negado: usuário não pertence à empresa';
  END IF;

  v_ano := EXTRACT(YEAR FROM now())::INTEGER;

  INSERT INTO contrato_assessoria_contadores (empresa_id, ultimo_seq, ano)
  VALUES (p_empresa_id, 78, v_ano)
  ON CONFLICT (empresa_id, ano) DO UPDATE
    SET ultimo_seq = contrato_assessoria_contadores.ultimo_seq + 1
  RETURNING ultimo_seq INTO v_seq;

  RETURN v_seq::TEXT || '/' || v_ano::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION previa_numero_contrato_assessoria(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION gerar_numero_contrato_assessoria(UUID) TO authenticated;
