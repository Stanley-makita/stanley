-- ============================================================
-- Migration: 20260415_003_dashboard
-- Módulo: Dashboard (views e functions de leitura)
-- ============================================================

CREATE OR REPLACE VIEW dashboard_kpis AS
SELECT
  u.empresa_id,
  COUNT(DISTINCT u.id) FILTER (
    WHERE u.ativo = true AND u.deleted_at IS NULL
  )::int AS membros_ativos,
  0::int          AS processos_ativos,
  0::int          AS processos_mes,
  0::int          AS leads_mes,
  0::int          AS leads_convertidos,
  0::numeric      AS valor_carteira
FROM usuarios u
WHERE u.deleted_at IS NULL
GROUP BY u.empresa_id;

CREATE OR REPLACE FUNCTION dashboard_processos_por_fase(p_empresa_id UUID)
RETURNS TABLE (
  fase_nome   TEXT,
  fase_cor    TEXT,
  total       INT,
  percentual  NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_empresa_id UUID;
BEGIN
  SELECT empresa_id INTO v_empresa_id
  FROM usuarios
  WHERE auth_user_id = auth.uid()
  LIMIT 1;

  IF v_empresa_id IS NULL OR v_empresa_id != p_empresa_id THEN
    RAISE EXCEPTION 'Acesso negado: empresa_id inválido';
  END IF;

  RETURN QUERY
  SELECT
    f.nome::TEXT                     AS fase_nome,
    COALESCE(f.cor, '#94a3b8')::TEXT AS fase_cor,
    0::INT                           AS total,
    0::NUMERIC                       AS percentual
  FROM fases f
  WHERE f.empresa_id = p_empresa_id
    AND f.deleted_at IS NULL
  ORDER BY f.ordem;
END;
$$;

CREATE OR REPLACE FUNCTION dashboard_atividade_recente(
  p_empresa_id UUID,
  p_limite     INT DEFAULT 10
)
RETURNS TABLE (
  id        UUID,
  tipo      TEXT,
  descricao TEXT,
  usuario   TEXT,
  criado_em TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_empresa_id UUID;
BEGIN
  SELECT empresa_id INTO v_empresa_id
  FROM usuarios
  WHERE auth_user_id = auth.uid()
  LIMIT 1;

  IF v_empresa_id IS NULL OR v_empresa_id != p_empresa_id THEN
    RAISE EXCEPTION 'Acesso negado: empresa_id inválido';
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    'usuario_convidado'::TEXT                       AS tipo,
    ('Novo membro: ' || u.nome)::TEXT               AS descricao,
    criador.nome::TEXT                              AS usuario,
    c.aceito_em                                     AS criado_em
  FROM convites c
  JOIN usuarios u       ON u.empresa_id = c.empresa_id AND u.email = c.email
  JOIN usuarios criador ON criador.id = c.criado_por
  WHERE c.empresa_id = p_empresa_id
    AND c.aceito_em IS NOT NULL
  ORDER BY c.aceito_em DESC
  LIMIT p_limite;
END;
$$;
