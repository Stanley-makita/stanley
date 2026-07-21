-- Bug legado gerente×gestor — Checklist dinâmico, Fase status e RPC de relatório.
--
-- Mesma causa dos commits anteriores: só 'gerente' era reconhecido, nunca
-- 'gestor'. Troca cirúrgica nos IN-lists, mantém 'gerente'. WITH CHECK
-- explícito adicionado nas policies de UPDATE que não tinham.
--
-- relatorio_por_equipe(): o filtro de perfil aqui não é controle de acesso
-- (isso já é feito pelo IF NOT EXISTS logo no início da função, que só
-- checa empresa_id/ativo) — é um filtro de QUAIS usuários aparecem como
-- linha no relatório de equipe. Sem 'gestor', um usuário gestor real nunca
-- aparecia como membro da equipe no relatório, mesmo tendo processos e
-- leads atribuídos.
--
-- Rollback: DROP as policies novas e recriar exatamente como em
-- supabase/migrations/20260601_063_checklist_dinamico.sql e
-- supabase/migrations/20260612_090_fase_statuses.sql (IN ('admin','gerente'),
-- sem gestor); para a função, CREATE OR REPLACE com a versão anterior
-- (mesma função, linha 276 com IN ('comercial', 'admin', 'gerente')) em
-- supabase/migrations/20260415_007_relatorios_rpcs.sql.

-- ── Checklist dinâmico ───────────────────────────────────────
DROP POLICY "checklist_templates_insert" ON checklist_templates;
CREATE POLICY "checklist_templates_insert" ON checklist_templates
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND perfil IN ('admin', 'gerente', 'gestor'))
  );

DROP POLICY "checklist_templates_update" ON checklist_templates;
CREATE POLICY "checklist_templates_update" ON checklist_templates
  FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND perfil IN ('admin', 'gerente', 'gestor'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND perfil IN ('admin', 'gerente', 'gestor'))
  );

DROP POLICY "checklist_templates_delete" ON checklist_templates;
CREATE POLICY "checklist_templates_delete" ON checklist_templates
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND perfil IN ('admin', 'gerente', 'gestor'))
  );

DROP POLICY "checklist_items_insert" ON checklist_items;
CREATE POLICY "checklist_items_insert" ON checklist_items
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND perfil IN ('admin', 'gerente', 'gestor'))
  );

DROP POLICY "checklist_items_update" ON checklist_items;
CREATE POLICY "checklist_items_update" ON checklist_items
  FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND perfil IN ('admin', 'gerente', 'gestor'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND perfil IN ('admin', 'gerente', 'gestor'))
  );

DROP POLICY "checklist_items_delete" ON checklist_items;
CREATE POLICY "checklist_items_delete" ON checklist_items
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND perfil IN ('admin', 'gerente', 'gestor'))
  );

-- ── Fase status ────────────────────────────────────────────────
DROP POLICY "fase_statuses_insert" ON fase_statuses;
CREATE POLICY "fase_statuses_insert" ON fase_statuses
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND perfil IN ('admin', 'gerente', 'gestor'))
  );

DROP POLICY "fase_statuses_update" ON fase_statuses;
CREATE POLICY "fase_statuses_update" ON fase_statuses
  FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND perfil IN ('admin', 'gerente', 'gestor'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND perfil IN ('admin', 'gerente', 'gestor'))
  );

DROP POLICY "fase_statuses_delete" ON fase_statuses;
CREATE POLICY "fase_statuses_delete" ON fase_statuses
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND perfil IN ('admin', 'gerente', 'gestor'))
  );

-- ── RPC relatorio_por_equipe ───────────────────────────────────
CREATE OR REPLACE FUNCTION relatorio_por_equipe(
  p_empresa_id  UUID,
  p_data_inicio DATE,
  p_data_fim    DATE
)
RETURNS TABLE (
  comercial_id     UUID,
  comercial_nome   TEXT,
  posicao          BIGINT,
  num_contratos    BIGINT,
  valor_emitido    NUMERIC,
  comissao         NUMERIC,
  leads_criados    BIGINT,
  leads_convertidos BIGINT,
  taxa_conversao   NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM usuarios
    WHERE id = auth.uid() AND empresa_id = p_empresa_id AND ativo = true
  ) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  RETURN QUERY
  WITH emissoes_comercial AS (
    SELECT
      p.comercial_id                       AS comercial_id,
      COUNT(p.id)                          AS num_contratos,
      COALESCE(SUM(p.valor_financiado), 0) AS valor_emitido,
      COALESCE(
        SUM(c.valor_bruto) FILTER (WHERE c.id IS NOT NULL),
        0
      )                                    AS comissao
    FROM processos p
    LEFT JOIN comissoes c ON c.processo_id = p.id
    WHERE p.empresa_id    = p_empresa_id
      AND p.status_emissao = 'emitido'
      AND p.data_emissao BETWEEN p_data_inicio AND p_data_fim
    GROUP BY p.comercial_id
  ),
  leads_comercial AS (
    SELECT
      l.responsavel_id                     AS comercial_id,
      COUNT(l.id)                          AS leads_criados,
      COUNT(l.id) FILTER (
        WHERE l.id IN (
          SELECT lead_id FROM processos
          WHERE empresa_id = p_empresa_id
            AND lead_id IS NOT NULL
        )
      )                                    AS leads_convertidos
    FROM leads l
    WHERE l.empresa_id = p_empresa_id
      AND l.created_at BETWEEN p_data_inicio AND p_data_fim
    GROUP BY l.responsavel_id
  )
  SELECT
    u.id                                                         AS comercial_id,
    u.nome                                                       AS comercial_nome,
    RANK() OVER (ORDER BY COALESCE(ec.valor_emitido, 0) DESC)    AS posicao,
    COALESCE(ec.num_contratos, 0)                                AS num_contratos,
    COALESCE(ec.valor_emitido, 0)                                AS valor_emitido,
    COALESCE(ec.comissao, 0)                                     AS comissao,
    COALESCE(lc.leads_criados, 0)                                AS leads_criados,
    COALESCE(lc.leads_convertidos, 0)                            AS leads_convertidos,
    CASE WHEN COALESCE(lc.leads_criados, 0) > 0
         THEN ROUND(
           (COALESCE(lc.leads_convertidos, 0)::NUMERIC /
            lc.leads_criados::NUMERIC) * 100,
           1
         )
         ELSE 0
    END                                                          AS taxa_conversao
  FROM usuarios u
  LEFT JOIN emissoes_comercial ec ON ec.comercial_id = u.id
  LEFT JOIN leads_comercial    lc ON lc.comercial_id = u.id
  WHERE u.empresa_id = p_empresa_id
    AND u.ativo      = true
    AND u.perfil     IN ('comercial', 'admin', 'gerente', 'gestor')
    AND (ec.num_contratos > 0 OR lc.leads_criados > 0)
  ORDER BY valor_emitido DESC;
END;
$$;
