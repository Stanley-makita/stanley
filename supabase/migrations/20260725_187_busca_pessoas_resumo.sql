-- Busca Global de Pessoas — resumo mínimo fora da carteira comercial.
--
-- Hoje a Busca Global (Topbar) faz uma query direta em `pessoas`, sujeita à
-- RLS de carteira comercial (20260724_186): um comercial buscando alguém
-- fora da própria carteira não recebe resultado nenhum — silêncio total.
--
-- Isso responde à pergunta errada. A Busca Global deve responder "esta
-- Pessoa já possui relacionamento com a empresa?", não "tenho permissão
-- para abrir este cadastro?" — a permissão de acesso continua sendo
-- aplicada só quando o usuário tenta de fato visualizar/operar a Pessoa
-- (RLS de pessoas_empresa_select, inalterada).
--
-- Fonte única de verdade para perfil comercial (evita duas implementações
-- divergentes): classifica cada Pessoa encontrada em 3 situações e nunca
-- devolve dado sensível (renda, observações, documentos, cônjuge, conversas).
--
-- "Responsável pelo atendimento ativo" é um conceito de negócio, não uma
-- regra amarrada ao modelo de Lead — hoje é derivado de leads/processos
-- porque são as estruturas que existem, mas se algo vier a substituir o
-- Lead como centro do fluxo, só a derivação interna desta função muda.

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
  WITH atendimento_atual AS (
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
    LEFT JOIN processos proc
      ON proc.pessoa_id = p.id
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
      proc.pessoa_id,
      COUNT(*) FILTER (
        WHERE proc.status_processo IN ('em_analise', 'pendente')
           OR (proc.status_processo = 'aprovado' AND proc.status_emissao = 'nao_emitido')
      )::int AS andamento,
      COUNT(*) FILTER (
        WHERE proc.status_processo IN ('reprovado', 'cancelado')
           OR proc.status_emissao = 'emitido'
      )::int AS concluidos,
      MAX(proc.updated_at) AS ultimo_processo_em
    FROM processos proc
    WHERE proc.empresa_id = v_empresa_id
      AND proc.deleted_at IS NULL
      AND proc.pessoa_id IS NOT NULL
    GROUP BY proc.pessoa_id
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

GRANT EXECUTE ON FUNCTION busca_pessoas_resumo(text) TO authenticated;
