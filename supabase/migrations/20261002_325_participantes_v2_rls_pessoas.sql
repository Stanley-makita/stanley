-- ============================================================
-- Migration 325: Pessoa visível por participação (spec participantes V2)
-- Comercial vê a Pessoa que participa de um lead/processo da carteira dele
-- (inclusive quando ela é cliente de outro comercial) e o cônjuge dessa Pessoa.
-- SECURITY DEFINER: evita recursão pessoas → pessoa_relacionamentos → pessoas.
-- ============================================================

CREATE OR REPLACE FUNCTION pessoa_visivel_por_participacao(p_pessoa_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM participacoes pa
    LEFT JOIN leads l      ON l.id  = pa.lead_id
    LEFT JOIN processos pr ON pr.id = pa.processo_id
    WHERE pa.pessoa_id IN (
        SELECT p_pessoa_id
        UNION ALL
        SELECT CASE WHEN r.pessoa_a_id = p_pessoa_id THEN r.pessoa_b_id ELSE r.pessoa_a_id END
        FROM pessoa_relacionamentos r
        WHERE r.data_fim IS NULL AND p_pessoa_id IN (r.pessoa_a_id, r.pessoa_b_id)
      )
      AND (
        (l.id IS NOT NULL AND l.deleted_at IS NULL AND l.responsavel_id = usuario_atual_id())
        OR (pr.id IS NOT NULL AND pr.deleted_at IS NULL
            AND (pr.comercial_id = usuario_atual_id() OR pr.operacional_id = usuario_atual_id()))
      )
  );
$$;

-- Mesma policy da migration 320 + a nova condição.
DROP POLICY IF EXISTS "pessoas_empresa_select" ON pessoas;
CREATE POLICY "pessoas_empresa_select" ON pessoas FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM usuarios u
    WHERE u.auth_user_id = auth.uid() AND u.ativo = true
      AND u.empresa_id = pessoas.empresa_id
      AND usuario_atual_pode('pessoas.ver')
  )
  AND (
    usuario_atual_pode('leads.ver_todas')
    OR EXISTS (
      SELECT 1 FROM leads l
      WHERE l.pessoa_id = pessoas.id
        AND l.deleted_at IS NULL
        AND l.responsavel_id = usuario_atual_id()
    )
    OR pessoa_visivel_por_participacao(pessoas.id)
  )
);

NOTIFY pgrst, 'reload schema';
