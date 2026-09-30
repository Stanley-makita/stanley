-- ============================================================
-- Migration 331: Participantes V2 — B2b: "compõe renda" definido à mão
-- A sincronização (326) recalcula compoe_renda a cada edição pelas regras antigas
-- (coparticipante = sim; cônjuge = tem renda). Na tela de participantes o usuário marca/desmarca
-- por pessoa (PATCH /api/participacoes/[id]): esse valor fica em compoe_renda_manual e vence a
-- regra. Participação de NEGÓCIO nova herda o manual da mesma Pessoa no lead do negócio
-- (conversão lead → negócio). Função = cópia literal da 326, só os dois INSERT trocados.
-- ============================================================
BEGIN;

ALTER TABLE participacoes ADD COLUMN IF NOT EXISTS compoe_renda_manual BOOLEAN;

CREATE OR REPLACE FUNCTION pv2_gravar_participacoes(
  p_lead_id uuid, p_processo_id uuid, p_empresa_id uuid,
  p_pessoas uuid[], p_papeis text[], p_renda boolean[], p_ordens int[]
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_titular uuid;
BEGIN
  IF to_regclass('pg_temp.pv2_desejadas') IS NULL THEN
    CREATE TEMP TABLE pv2_desejadas (pessoa_id uuid, papel text, compoe_renda boolean, ordem int) ON COMMIT DROP;
  END IF;
  TRUNCATE pg_temp.pv2_desejadas;
  INSERT INTO pg_temp.pv2_desejadas
  SELECT DISTINCT ON (x.pessoa_id) x.pessoa_id, x.papel, x.renda, x.ordem
  FROM unnest(p_pessoas, p_papeis, p_renda, p_ordens) WITH ORDINALITY AS x(pessoa_id, papel, renda, ordem, prioridade)
  WHERE x.pessoa_id IS NOT NULL AND NOT pessoa_e_de_operador(x.pessoa_id) AND EXISTS (SELECT 1 FROM pessoas px WHERE px.id = x.pessoa_id AND px.deleted_at IS NULL AND px.empresa_id = p_empresa_id)
  ORDER BY x.pessoa_id, x.prioridade;

  SELECT pessoa_id INTO v_titular FROM pg_temp.pv2_desejadas WHERE papel = 'titular';

  DELETE FROM participacoes pa
  WHERE ((p_lead_id IS NOT NULL AND pa.lead_id = p_lead_id) OR (p_processo_id IS NOT NULL AND pa.processo_id = p_processo_id))
    AND NOT EXISTS (SELECT 1 FROM pg_temp.pv2_desejadas d WHERE d.pessoa_id = pa.pessoa_id);

  -- Rebaixa o titular antigo antes de promover o novo (índice de titular único).
  UPDATE participacoes pa SET papel = 'coparticipante'
  WHERE ((p_lead_id IS NOT NULL AND pa.lead_id = p_lead_id) OR (p_processo_id IS NOT NULL AND pa.processo_id = p_processo_id))
    AND pa.papel = 'titular' AND pa.pessoa_id IS DISTINCT FROM v_titular;

  IF p_lead_id IS NOT NULL THEN
    INSERT INTO participacoes (empresa_id, lead_id, pessoa_id, papel, compoe_renda, ordem)
    SELECT p_empresa_id, p_lead_id, d.pessoa_id, d.papel, d.compoe_renda, d.ordem FROM pg_temp.pv2_desejadas d
    ON CONFLICT (lead_id, pessoa_id) WHERE lead_id IS NOT NULL
    DO UPDATE SET papel = EXCLUDED.papel,
                  compoe_renda = coalesce(participacoes.compoe_renda_manual, EXCLUDED.compoe_renda),
                  ordem = EXCLUDED.ordem
    WHERE (participacoes.papel, participacoes.compoe_renda, participacoes.ordem)
          IS DISTINCT FROM (EXCLUDED.papel, coalesce(participacoes.compoe_renda_manual, EXCLUDED.compoe_renda), EXCLUDED.ordem);
  ELSE
    INSERT INTO participacoes (empresa_id, processo_id, pessoa_id, papel, compoe_renda, ordem, compoe_renda_manual)
    SELECT p_empresa_id, p_processo_id, d.pessoa_id, d.papel,
           coalesce(h.manual, d.compoe_renda), d.ordem, h.manual
    FROM pg_temp.pv2_desejadas d
    LEFT JOIN LATERAL (
      SELECT lp.compoe_renda_manual AS manual
      FROM processos pr JOIN participacoes lp ON lp.lead_id = pr.lead_id AND lp.pessoa_id = d.pessoa_id
      WHERE pr.id = p_processo_id AND lp.compoe_renda_manual IS NOT NULL
      LIMIT 1
    ) h ON true
    ON CONFLICT (processo_id, pessoa_id) WHERE processo_id IS NOT NULL
    DO UPDATE SET papel = EXCLUDED.papel,
                  compoe_renda = coalesce(participacoes.compoe_renda_manual, EXCLUDED.compoe_renda),
                  ordem = EXCLUDED.ordem
    WHERE (participacoes.papel, participacoes.compoe_renda, participacoes.ordem)
          IS DISTINCT FROM (EXCLUDED.papel, coalesce(participacoes.compoe_renda_manual, EXCLUDED.compoe_renda), EXCLUDED.ordem);
  END IF;
END $$;

COMMIT;
