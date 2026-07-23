-- Fix: busca_pessoas_resumo (20260725_187) só considerava processos
-- vinculados via processos.pessoa_id — coluna preenchida apenas quando o
-- processo é criado direto da tela da Pessoa (20260519_043). O caminho normal
-- de criação (Kanban/Lead, via NovoProcessoModal) vincula o cliente através
-- de processo_compradores.pessoa_id (20260507_024), que a função nunca
-- olhava. Resultado: Pessoas com financiamento ativo de verdade apareciam na
-- Busca Global como "sem_atendimento_ativo", 0 negócios em andamento/
-- concluídos (achado: Gabriel de Andrade Cristino, financiamento ativo,
-- operacional Bruno Machado).

CREATE OR REPLACE FUNCTION busca_pessoas_resumo(p_termo text)
RETURNS TABLE (
  id uuid,
  nome text,
  situacao text,
  responsavel_atual_nome text,
  negocios_andamento integer,
  negocios_concluidos integer,
  ultimo_relacionamento_em timestamptz,
  cpf text,
  telefone text
) AS $$
DECLARE
  v_empresa_id uuid := usuario_atual_empresa_id();
  v_usuario_id uuid := usuario_atual_id();
  v_termo text := '%' || p_termo || '%';
BEGIN
  RETURN QUERY
  WITH processo_pessoa AS (
    -- Une as duas formas de vincular um processo a uma Pessoa: direto
    -- (processos.pessoa_id) e via comprador (processo_compradores.pessoa_id,
    -- caminho normal do Kanban/Lead). UNION (não ALL) evita contar o mesmo
    -- processo 2x quando as duas vias apontam pra mesma pessoa.
    SELECT proc.id AS processo_id, proc.pessoa_id
    FROM processos proc
    WHERE proc.pessoa_id IS NOT NULL
    UNION
    SELECT pc.processo_id, pc.pessoa_id
    FROM processo_compradores pc
    WHERE pc.pessoa_id IS NOT NULL
  ),
  atendimento_atual AS (
    -- Responsável pelo atendimento ativo de cada pessoa: lead ativo mais
    -- recente tem prioridade; na ausência dele, processo ativo mais recente.
    SELECT DISTINCT ON (p.id)
      p.id AS pessoa_id,
      COALESCE(l.responsavel_id, proc.comercial_id) AS responsavel_id,
      COALESCE(l.updated_at, proc.updated_at) AS atualizado_em
    FROM pessoas p
    LEFT JOIN leads l
      ON l.pessoa_id = p.id
      AND l.deleted_at IS NULL
      AND l.perdido_em IS NULL
      AND l.convertido_em IS NULL
    LEFT JOIN processo_pessoa pp ON pp.pessoa_id = p.id
    LEFT JOIN processos proc
      ON proc.id = pp.processo_id
      AND proc.deleted_at IS NULL
      AND (
        proc.status_processo IN ('em_analise', 'pendente')
        OR (proc.status_processo = 'aprovado' AND proc.status_emissao = 'nao_emitido')
      )
    WHERE p.empresa_id = v_empresa_id
      AND (l.id IS NOT NULL OR proc.id IS NOT NULL)
    ORDER BY p.id, COALESCE(l.updated_at, proc.updated_at) DESC NULLS LAST
  ),
  contadores AS (
    SELECT
      pp.pessoa_id,
      COUNT(*) FILTER (
        WHERE proc.status_processo IN ('em_analise', 'pendente')
           OR (proc.status_processo = 'aprovado' AND proc.status_emissao = 'nao_emitido')
      )::int AS andamento,
      COUNT(*) FILTER (
        WHERE proc.status_processo IN ('reprovado', 'cancelado')
           OR proc.status_emissao = 'emitido'
      )::int AS concluidos,
      MAX(proc.updated_at) AS ultimo_processo_em
    FROM processo_pessoa pp
    JOIN processos proc ON proc.id = pp.processo_id
    WHERE proc.empresa_id = v_empresa_id
      AND proc.deleted_at IS NULL
    GROUP BY pp.pessoa_id
  )
  SELECT
    p.id,
    p.nome,
    CASE
      WHEN a.responsavel_id = v_usuario_id THEN 'minha_carteira'
      WHEN a.responsavel_id IS NOT NULL THEN 'ativo_outro_comercial'
      ELSE 'sem_atendimento_ativo'
    END AS situacao,
    resp.nome AS responsavel_atual_nome,
    COALESCE(c.andamento, 0) AS negocios_andamento,
    COALESCE(c.concluidos, 0) AS negocios_concluidos,
    GREATEST(a.atualizado_em, c.ultimo_processo_em) AS ultimo_relacionamento_em,
    -- cpf/telefone só saem quando é a própria carteira do usuário ou quando
    -- não há atendimento ativo nenhum (aí servem só pra reaproveitar sem duplicar)
    CASE WHEN a.responsavel_id IS NULL OR a.responsavel_id = v_usuario_id
      THEN p.cpf ELSE NULL END AS cpf,
    CASE WHEN a.responsavel_id IS NULL OR a.responsavel_id = v_usuario_id
      THEN (
        SELECT pt.telefone FROM pessoa_telefones pt
        WHERE pt.pessoa_id = p.id AND pt.ativo = true
        ORDER BY pt.principal DESC, pt.created_at ASC
        LIMIT 1
      )
      ELSE NULL
    END AS telefone
  FROM pessoas p
  LEFT JOIN atendimento_atual a ON a.pessoa_id = p.id
  LEFT JOIN usuarios resp ON resp.id = a.responsavel_id
  LEFT JOIN contadores c ON c.pessoa_id = p.id
  WHERE p.empresa_id = v_empresa_id
    AND p.deleted_at IS NULL
    AND (
      p.nome ILIKE v_termo
      OR p.cpf ILIKE v_termo
      OR EXISTS (
        SELECT 1 FROM pessoa_telefones pt
        WHERE pt.pessoa_id = p.id AND pt.ativo = true AND pt.telefone ILIKE v_termo
      )
    )
  ORDER BY p.nome
  LIMIT 10;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;
