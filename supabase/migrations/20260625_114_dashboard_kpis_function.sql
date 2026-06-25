-- Cria a função RPC dashboard_kpis.
-- Antes só existia uma VIEW com o mesmo nome (sem parâmetro), chamada incorretamente
-- como RPC, causando 404. Esta função substitui o padrão correto.

DROP FUNCTION IF EXISTS public.dashboard_kpis(UUID);

CREATE OR REPLACE FUNCTION public.dashboard_kpis(p_empresa_id UUID)
RETURNS TABLE (
  "processosAtivos"         INTEGER,
  "processosAtivosVariacao" NUMERIC,
  "leadsMes"                INTEGER,
  "leadsMesVariacao"        NUMERIC,
  "taxaConversao"           NUMERIC,
  "taxaConversaoVariacao"   NUMERIC,
  "valorCarteira"           BIGINT,
  "valoreCarteiraVariacao"  NUMERIC,
  "membrosAtivos"           INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inicio_mes   TIMESTAMPTZ := date_trunc('month', now());
  v_inicio_ant   TIMESTAMPTZ := date_trunc('month', now() - INTERVAL '1 month');
  v_fim_ant      TIMESTAMPTZ := date_trunc('month', now());

  v_proc_ativos  INTEGER := 0;
  v_proc_ant_ct  INTEGER := 0;
  v_leads_mes    INTEGER := 0;
  v_leads_ant    INTEGER := 0;
  v_proc_mes     INTEGER := 0;
  v_valor        BIGINT  := 0;
  v_valor_ant    BIGINT  := 0;
BEGIN
  SELECT COUNT(*)::INTEGER INTO v_proc_ativos
  FROM processos
  WHERE empresa_id = p_empresa_id AND deleted_at IS NULL
    AND status_processo NOT IN ('reprovado', 'cancelado');

  SELECT COUNT(*)::INTEGER INTO v_proc_ant_ct
  FROM processos
  WHERE empresa_id = p_empresa_id AND deleted_at IS NULL
    AND status_processo NOT IN ('reprovado', 'cancelado')
    AND created_at < v_fim_ant;

  SELECT COUNT(*)::INTEGER INTO v_leads_mes
  FROM leads
  WHERE empresa_id = p_empresa_id AND deleted_at IS NULL
    AND created_at >= v_inicio_mes;

  SELECT COUNT(*)::INTEGER INTO v_leads_ant
  FROM leads
  WHERE empresa_id = p_empresa_id AND deleted_at IS NULL
    AND created_at >= v_inicio_ant AND created_at < v_fim_ant;

  SELECT COUNT(*)::INTEGER INTO v_proc_mes
  FROM processos
  WHERE empresa_id = p_empresa_id AND deleted_at IS NULL
    AND created_at >= v_inicio_mes;

  SELECT COALESCE(SUM((COALESCE(valor_financiado, 0) * 100)::BIGINT), 0) INTO v_valor
  FROM processos
  WHERE empresa_id = p_empresa_id AND deleted_at IS NULL
    AND status_processo NOT IN ('reprovado', 'cancelado');

  SELECT COALESCE(SUM((COALESCE(valor_financiado, 0) * 100)::BIGINT), 0) INTO v_valor_ant
  FROM processos
  WHERE empresa_id = p_empresa_id AND deleted_at IS NULL
    AND status_processo NOT IN ('reprovado', 'cancelado')
    AND created_at < v_fim_ant;

  RETURN QUERY SELECT
    v_proc_ativos,
    CASE WHEN v_proc_ant_ct = 0 THEN 0::NUMERIC
         ELSE ROUND(((v_proc_ativos - v_proc_ant_ct)::NUMERIC / v_proc_ant_ct * 100), 1)
    END,
    v_leads_mes,
    CASE WHEN v_leads_ant = 0 THEN 0::NUMERIC
         ELSE ROUND(((v_leads_mes - v_leads_ant)::NUMERIC / v_leads_ant * 100), 1)
    END,
    CASE WHEN v_leads_mes = 0 THEN 0::NUMERIC
         ELSE ROUND((v_proc_mes::NUMERIC / v_leads_mes * 100), 1)
    END,
    0::NUMERIC,
    v_valor,
    CASE WHEN v_valor_ant = 0 THEN 0::NUMERIC
         ELSE ROUND(((v_valor - v_valor_ant)::NUMERIC / v_valor_ant * 100), 1)
    END,
    0::INTEGER;
END;
$$;

GRANT EXECUTE ON FUNCTION public.dashboard_kpis(UUID) TO authenticated;
