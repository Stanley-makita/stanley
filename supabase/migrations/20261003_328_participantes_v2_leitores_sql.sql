-- ============================================================
-- Migration 328: Participantes V2 — Fase B1: leitores SQL (relatórios, financeiro, busca)
-- Nome/CPF do cliente passam a vir da Pessoa do TITULAR em participacoes, não de
-- processo_compradores. Enquanto a sincronização da Fase A existir, o resultado é o
-- mesmo (ver supabase/2026-10-03_equivalencia_leitores_participantes_v2.sql, rodar ANTES).
-- Cada função abaixo é cópia literal da definição vigente (arquivo/linha no comentário),
-- alterando SÓ o bloco LATERAL "pc" (ou a CTE processo_pessoa em busca_pessoas_resumo).
-- Relatórios de negócio já emitido NÃO filtram pessoas.deleted_at: Pessoa excluída
-- depois continua aparecendo pelo nome no histórico (mesmo comportamento de antes,
-- quando o nome vinha copiado em processo_compradores).
-- contas_a_receber_mes_preview: corrige de carona COALESCE(pe.nome, pc.nome) →
-- COALESCE(pc.nome, pe.nome), mesma prioridade que a 296 aplicou nas outras funções
-- (processos.pessoa_id é legado e pode apontar para a pessoa errada).
-- Rodar fora do horário comercial (CREATE OR REPLACE de função usada pelo financeiro).
-- ============================================================
BEGIN;

-- de 20260911_296_fix_prioridade_pessoa_id_vs_comprador.sql:645
CREATE OR REPLACE FUNCTION analise_comissoes_contratos_mes(
  p_empresa_id UUID,
  p_mes        INTEGER,
  p_ano        INTEGER
)
RETURNS TABLE (
  id                       UUID,
  processo_id              UUID,
  cliente_nome             TEXT,
  cliente_cpf              TEXT,
  comercial_nome           TEXT,
  corretor_nome            TEXT,
  imobiliaria_nome         TEXT,
  prospectado_por          TEXT,
  financiou                BOOLEAN,
  valor_contrato           NUMERIC,
  data_pagamento_contrato  DATE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.empresa_id = p_empresa_id AND u.ativo = true
  ) THEN
    RAISE EXCEPTION 'Acesso negado: empresa_id inválido para este usuário';
  END IF;

  RETURN QUERY
  SELECT
    p.id                            AS id,
    p.id                            AS processo_id,
    COALESCE(pc.nome, pe.nome, '')  AS cliente_nome,
    COALESCE(pc.cpf, pe.cpf, '')    AS cliente_cpf,
    uc.nome                         AS comercial_nome,
    cor.nome                        AS corretor_nome,
    imob.nome                       AS imobiliaria_nome,
    p.prospectado_por               AS prospectado_por,
    p.financiou                     AS financiou,
    p.valor_contrato                AS valor_contrato,
    p.data_pagamento_contrato       AS data_pagamento_contrato
  FROM processos p
  LEFT JOIN usuarios uc ON uc.id = p.comercial_id
  LEFT JOIN pessoas pe ON pe.id = p.pessoa_id
  LEFT JOIN LATERAL (
    SELECT tp.nome, tp.cpf FROM participacoes tpa
    JOIN pessoas tp ON tp.id = tpa.pessoa_id
    WHERE tpa.processo_id = p.id AND tpa.papel = 'titular'
    LIMIT 1
  ) pc ON true
  LEFT JOIN LATERAL (
    SELECT c.nome FROM processo_corretores pcor
    JOIN corretores c ON c.id = pcor.corretor_id
    WHERE pcor.processo_id = p.id
    ORDER BY pcor.principal DESC NULLS LAST, pcor.criado_em ASC LIMIT 1
  ) cor ON true
  LEFT JOIN LATERAL (
    SELECT i.nome FROM processo_imobiliarias pim
    JOIN imobiliarias i ON i.id = pim.imobiliaria_id
    WHERE pim.processo_id = p.id
    ORDER BY pim.criado_em ASC LIMIT 1
  ) imob ON true
  WHERE p.empresa_id = p_empresa_id
    AND p.modalidade = 'Contrato'
    AND p.data_pagamento_contrato IS NOT NULL
    AND EXTRACT(MONTH FROM p.data_pagamento_contrato) = p_mes
    AND EXTRACT(YEAR  FROM p.data_pagamento_contrato) = p_ano
  ORDER BY p.data_pagamento_contrato DESC;
END;
$$;

-- de 20260914_307_multiplas_regras_comissao_por_categoria.sql:813
CREATE OR REPLACE FUNCTION analise_comissoes_mes(
  p_empresa_id UUID,
  p_mes        INTEGER,
  p_ano        INTEGER
)
RETURNS TABLE (
  id                    UUID,
  processo_id           UUID,
  cliente_nome          TEXT,
  cliente_cpf           TEXT,
  banco_nome            TEXT,
  banco_cor             TEXT,
  modalidade            TEXT,
  valor_financiado      NUMERIC,
  comercial_nome        TEXT,
  valor_assessoria      NUMERIC,
  percentual_comissao   NUMERIC,
  comissao              NUMERIC,
  responsavel_registro  TEXT,
  comissao_comercial    NUMERIC,
  cgi_especial          BOOLEAN,
  data_emissao          DATE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.empresa_id = p_empresa_id AND u.ativo = true
  ) THEN
    RAISE EXCEPTION 'Acesso negado: empresa_id inválido para este usuário';
  END IF;

  RETURN QUERY
  SELECT
    p.id                                AS id,
    p.id                                AS processo_id,
    COALESCE(pc.nome, pe.nome, '')      AS cliente_nome,
    COALESCE(pc.cpf, pe.cpf, '')        AS cliente_cpf,
    b.nome                              AS banco_nome,
    b.cor                               AS banco_cor,
    p.modalidade::TEXT                  AS modalidade,
    p.valor_financiado                  AS valor_financiado,
    uc.nome                             AS comercial_nome,
    COALESCE(p.valor_assessoria, 0)     AS valor_assessoria,
    COALESCE(cp.comissao_empresa, 0)    AS percentual_comissao,
    CASE
      WHEN COALESCE(cp.valor_maximo_comissao, 0) > 0
        THEN LEAST(ROUND(COALESCE(p.valor_financiado, 0) * COALESCE(cp.comissao_empresa, 0) / 100, 2), cp.valor_maximo_comissao)
      ELSE ROUND(COALESCE(p.valor_financiado, 0) * COALESCE(cp.comissao_empresa, 0) / 100, 2)
    END                                  AS comissao,
    p.responsavel_registro              AS responsavel_registro,
    comissao_comercial_calculada(p)     AS comissao_comercial,
    COALESCE(
      p.modalidade = 'CGI' AND cgi.cgi_valor_limite IS NOT NULL
      AND p.valor_financiado > cgi.cgi_valor_limite,
      false
    )                                    AS cgi_especial,
    p.data_emissao                      AS data_emissao
  FROM processos p
  LEFT JOIN bancos b ON b.id = p.banco_id
  LEFT JOIN usuarios uc ON uc.id = p.comercial_id
  LEFT JOIN pessoas pe ON pe.id = p.pessoa_id
  LEFT JOIN LATERAL (
    SELECT tp.nome, tp.cpf FROM participacoes tpa
    JOIN pessoas tp ON tp.id = tpa.pessoa_id
    WHERE tpa.processo_id = p.id AND tpa.papel = 'titular'
    LIMIT 1
  ) pc ON true
  LEFT JOIN LATERAL (
    SELECT x.comissao_empresa, x.valor_maximo_comissao FROM comissoes_padrao x
    WHERE x.banco_id = p.banco_id AND x.empresa_id = p.empresa_id
      AND (x.modalidade = '' OR x.modalidade = p.modalidade::TEXT)
      AND COALESCE(p.valor_financiado, 0) >= x.piso_valor
      AND (x.teto_valor = 0 OR COALESCE(p.valor_financiado, 0) <= x.teto_valor)
    ORDER BY (x.modalidade <> '') DESC, x.piso_valor DESC
    LIMIT 1
  ) cp ON true
  LEFT JOIN LATERAL (
    SELECT r.cgi_valor_limite
    FROM usuarios u2
    JOIN rh_funcionarios f ON f.id = u2.funcionario_id
    JOIN rh_regras_comissao r ON r.id = resolver_regra_comissao(f.id, 'cgi')
    WHERE u2.id = p.comercial_id
      AND f.empresa_id = p.empresa_id
      AND f.status = 'ativo'
    LIMIT 1
  ) cgi ON true
  WHERE p.empresa_id = p_empresa_id
    AND p.status_emissao = 'emitido'
    AND p.modalidade NOT IN ('Contrato', 'Consorcio')
    AND p.data_emissao IS NOT NULL
    AND EXTRACT(MONTH FROM p.data_emissao) = p_mes
    AND EXTRACT(YEAR  FROM p.data_emissao) = p_ano
  ORDER BY p.data_emissao DESC;
END;
$$;

-- de 20260725_188_fix_busca_pessoas_resumo_compradores.sql:11
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
    -- (processos.pessoa_id) e via participação de compra (participacoes,
    -- V2; caminho normal do Kanban/Lead). UNION (não ALL) evita contar o mesmo
    -- processo 2x quando as duas vias apontam pra mesma pessoa.
    SELECT proc.id AS processo_id, proc.pessoa_id
    FROM processos proc
    WHERE proc.pessoa_id IS NOT NULL
    UNION
    -- V2: qualquer participante de compra (titular, coparticipante, cônjuge anuente).
    SELECT pa.processo_id, pa.pessoa_id
    FROM participacoes pa
    WHERE pa.processo_id IS NOT NULL
      AND pa.papel IN ('titular', 'coparticipante', 'conjuge_anuente')
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

-- de 20260826_272_fix_ambiguidade_id_preview_ao_vivo.sql:117
CREATE OR REPLACE FUNCTION contas_a_receber_mes_preview(
  p_empresa_id UUID,
  p_mes        INTEGER,
  p_ano        INTEGER
)
RETURNS TABLE (
  id                    UUID,
  processo_id           UUID,
  banco_id              UUID,
  banco_nome            TEXT,
  banco_cor             TEXT,
  cliente_nome          TEXT,
  origem                TEXT,
  valor_base            NUMERIC,
  percentual_previsto   NUMERIC,
  valor_previsto        NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.empresa_id = p_empresa_id AND u.ativo = true
  ) THEN
    RAISE EXCEPTION 'Acesso negado: empresa_id inválido para este usuário';
  END IF;

  RETURN QUERY
  SELECT
    gen_random_uuid(),
    p.id,
    p.banco_id,
    b.nome,
    b.cor,
    COALESCE(pc.nome, pe.nome, ''),
    'emissao'::TEXT,
    COALESCE(p.valor_financiado, 0),
    COALESCE(cp.comissao_empresa, 0),
    ROUND(COALESCE(p.valor_financiado, 0) * COALESCE(cp.comissao_empresa, 0) / 100, 2)
  FROM processos p
  LEFT JOIN bancos b ON b.id = p.banco_id
  LEFT JOIN pessoas pe ON pe.id = p.pessoa_id
  LEFT JOIN LATERAL (
    SELECT tp.nome FROM participacoes tpa
    JOIN pessoas tp ON tp.id = tpa.pessoa_id
    WHERE tpa.processo_id = p.id AND tpa.papel = 'titular'
    LIMIT 1
  ) pc ON true
  LEFT JOIN LATERAL (
    SELECT x.comissao_empresa FROM comissoes_padrao x
    WHERE x.banco_id = p.banco_id AND x.empresa_id = p.empresa_id
      AND (x.modalidade = '' OR x.modalidade = p.modalidade::TEXT)
    ORDER BY (x.modalidade <> '') DESC
    LIMIT 1
  ) cp ON true
  WHERE p.empresa_id = p_empresa_id
    AND p.status_emissao = 'emitido'
    AND p.modalidade NOT IN ('Contrato', 'Consorcio')
    AND p.data_emissao IS NOT NULL
    AND EXTRACT(MONTH FROM p.data_emissao) = p_mes
    AND EXTRACT(YEAR  FROM p.data_emissao) = p_ano

  UNION ALL

  SELECT
    gen_random_uuid(),
    p.id,
    NULL, NULL, NULL,
    COALESCE(pc.nome, pe.nome, ''),
    'contrato'::TEXT,
    COALESCE(p.valor_contrato, 0),
    0,
    COALESCE(p.valor_contrato, 0)
  FROM processos p
  LEFT JOIN pessoas pe ON pe.id = p.pessoa_id
  LEFT JOIN LATERAL (
    SELECT tp.nome FROM participacoes tpa
    JOIN pessoas tp ON tp.id = tpa.pessoa_id
    WHERE tpa.processo_id = p.id AND tpa.papel = 'titular'
    LIMIT 1
  ) pc ON true
  WHERE p.empresa_id = p_empresa_id
    AND p.modalidade = 'Contrato'
    AND p.status_emissao = 'emitido'
    AND p.data_emissao IS NOT NULL
    AND EXTRACT(MONTH FROM p.data_emissao) = p_mes
    AND EXTRACT(YEAR  FROM p.data_emissao) = p_ano;
END;
$$;

-- de 20260911_301_comissoes_padrao_faixas_de_valor.sql:877
CREATE OR REPLACE FUNCTION contas_a_receber_mes_vivo(
  p_empresa_id UUID,
  p_mes        INTEGER,
  p_ano        INTEGER
)
RETURNS TABLE (
  id                UUID,
  persistido        BOOLEAN,
  processo_id       UUID,
  banco_id          UUID,
  banco_nome        TEXT,
  banco_cor         TEXT,
  cliente_nome      TEXT,
  origem            TEXT,
  valor_previsto    NUMERIC,
  valor_recebido    NUMERIC,
  status            TEXT,
  data_prevista     DATE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.empresa_id = p_empresa_id AND u.ativo = true
  ) THEN
    RAISE EXCEPTION 'Acesso negado: empresa_id inválido para este usuário';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(cr.id, gen_random_uuid()) AS id,
    (cr.id IS NOT NULL)                AS persistido,
    p.id                                AS processo_id,
    p.banco_id                          AS banco_id,
    b.nome                              AS banco_nome,
    b.cor                               AS banco_cor,
    COALESCE(cr.cliente_nome, pc.nome, pe.nome, '') AS cliente_nome,
    COALESCE(cr.origem, 'emissao')      AS origem,
    COALESCE(cr.valor_previsto,
      CASE
        WHEN COALESCE(cp.valor_maximo_comissao, 0) > 0
          THEN LEAST(ROUND(COALESCE(p.valor_financiado, 0) * COALESCE(cp.comissao_empresa, 0) / 100, 2), cp.valor_maximo_comissao)
        ELSE ROUND(COALESCE(p.valor_financiado, 0) * COALESCE(cp.comissao_empresa, 0) / 100, 2)
      END
    ) AS valor_previsto,
    COALESCE(cr.valor_recebido, 0)      AS valor_recebido,
    COALESCE(cr.status::TEXT, 'a_faturar') AS status,
    cr.data_prevista                    AS data_prevista
  FROM processos p
  LEFT JOIN bancos b ON b.id = p.banco_id
  LEFT JOIN pessoas pe ON pe.id = p.pessoa_id
  LEFT JOIN LATERAL (
    SELECT tp.nome FROM participacoes tpa
    JOIN pessoas tp ON tp.id = tpa.pessoa_id
    WHERE tpa.processo_id = p.id AND tpa.papel = 'titular'
    LIMIT 1
  ) pc ON true
  LEFT JOIN LATERAL (
    SELECT x.comissao_empresa, x.valor_maximo_comissao FROM comissoes_padrao x
    WHERE x.banco_id = p.banco_id AND x.empresa_id = p.empresa_id
      AND (x.modalidade = '' OR x.modalidade = p.modalidade::TEXT)
      AND COALESCE(p.valor_financiado, 0) >= x.piso_valor
      AND (x.teto_valor = 0 OR COALESCE(p.valor_financiado, 0) <= x.teto_valor)
    ORDER BY (x.modalidade <> '') DESC, x.piso_valor DESC
    LIMIT 1
  ) cp ON true
  LEFT JOIN LATERAL (
    SELECT * FROM financeiro_contas_receber fcr
    WHERE fcr.processo_id = p.id
    ORDER BY fcr.created_at DESC LIMIT 1
  ) cr ON true
  WHERE p.empresa_id = p_empresa_id
    AND p.status_emissao = 'emitido'
    AND p.modalidade NOT IN ('Contrato', 'Consorcio')
    AND p.data_emissao IS NOT NULL
    AND EXTRACT(MONTH FROM p.data_emissao) = p_mes
    AND EXTRACT(YEAR  FROM p.data_emissao) = p_ano

  UNION ALL

  SELECT
    COALESCE(cr.id, gen_random_uuid()),
    (cr.id IS NOT NULL),
    p.id,
    NULL, NULL, NULL,
    COALESCE(cr.cliente_nome, pc.nome, pe.nome, ''),
    COALESCE(cr.origem, 'contrato'),
    COALESCE(cr.valor_previsto, COALESCE(p.valor_contrato, 0)),
    COALESCE(cr.valor_recebido, 0),
    COALESCE(cr.status::TEXT, 'a_faturar'),
    cr.data_prevista
  FROM processos p
  LEFT JOIN pessoas pe ON pe.id = p.pessoa_id
  LEFT JOIN LATERAL (
    SELECT tp.nome FROM participacoes tpa
    JOIN pessoas tp ON tp.id = tpa.pessoa_id
    WHERE tpa.processo_id = p.id AND tpa.papel = 'titular'
    LIMIT 1
  ) pc ON true
  LEFT JOIN LATERAL (
    SELECT * FROM financeiro_contas_receber fcr
    WHERE fcr.processo_id = p.id
    ORDER BY fcr.created_at DESC LIMIT 1
  ) cr ON true
  WHERE p.empresa_id = p_empresa_id
    AND p.modalidade = 'Contrato'
    AND p.status_emissao = 'emitido'
    AND p.data_emissao IS NOT NULL
    AND EXTRACT(MONTH FROM p.data_emissao) = p_mes
    AND EXTRACT(YEAR  FROM p.data_emissao) = p_ano;
END;
$$;

-- de 20260911_296_fix_prioridade_pessoa_id_vs_comprador.sql:269
CREATE OR REPLACE FUNCTION emissoes_mes_preview(
  p_empresa_id UUID,
  p_mes        INTEGER,
  p_ano        INTEGER
)
RETURNS TABLE (
  id                UUID,
  processo_id       UUID,
  cliente_nome      TEXT,
  banco_id          UUID,
  banco_nome        TEXT,
  banco_cor         TEXT,
  modalidade        TEXT,
  valor_financiado  NUMERIC,
  valor_assessoria  NUMERIC,
  data_emissao      DATE,
  comercial_id      UUID,
  comercial_nome    TEXT,
  operacional_id    UUID,
  operacional_nome  TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.empresa_id = p_empresa_id AND u.ativo = true
  ) THEN
    RAISE EXCEPTION 'Acesso negado: empresa_id inválido para este usuário';
  END IF;

  RETURN QUERY
  SELECT
    gen_random_uuid()          AS id,
    p.id                       AS processo_id,
    COALESCE(pc.nome, pe.nome, '') AS cliente_nome,
    p.banco_id                 AS banco_id,
    b.nome                     AS banco_nome,
    b.cor                      AS banco_cor,
    p.modalidade::TEXT         AS modalidade,
    p.valor_financiado         AS valor_financiado,
    COALESCE(p.valor_assessoria, 0) AS valor_assessoria,
    p.data_emissao             AS data_emissao,
    p.comercial_id             AS comercial_id,
    uc.nome                    AS comercial_nome,
    p.operacional_id           AS operacional_id,
    uo.nome                    AS operacional_nome
  FROM processos p
  LEFT JOIN bancos b ON b.id = p.banco_id
  LEFT JOIN usuarios uc ON uc.id = p.comercial_id
  LEFT JOIN usuarios uo ON uo.id = p.operacional_id
  LEFT JOIN pessoas pe ON pe.id = p.pessoa_id
  LEFT JOIN LATERAL (
    SELECT tp.nome FROM participacoes tpa
    JOIN pessoas tp ON tp.id = tpa.pessoa_id
    WHERE tpa.processo_id = p.id AND tpa.papel = 'titular'
    LIMIT 1
  ) pc ON true
  WHERE p.empresa_id = p_empresa_id
    AND p.status_emissao = 'emitido'
    AND p.modalidade NOT IN ('Contrato', 'Consorcio')
    AND p.data_emissao IS NOT NULL
    AND EXTRACT(MONTH FROM p.data_emissao) = p_mes
    AND EXTRACT(YEAR  FROM p.data_emissao) = p_ano

  UNION ALL

  SELECT
    gen_random_uuid(),
    p.id,
    COALESCE(pc.nome, pe.nome, ''),
    NULL, NULL, NULL,
    'Contrato'::TEXT,
    p.valor_contrato,
    0,
    p.data_emissao,
    p.comercial_id,
    uc.nome,
    p.juridico_id,
    uj.nome
  FROM processos p
  LEFT JOIN usuarios uc ON uc.id = p.comercial_id
  LEFT JOIN usuarios uj ON uj.id = p.juridico_id
  LEFT JOIN pessoas pe ON pe.id = p.pessoa_id
  LEFT JOIN LATERAL (
    SELECT tp.nome FROM participacoes tpa
    JOIN pessoas tp ON tp.id = tpa.pessoa_id
    WHERE tpa.processo_id = p.id AND tpa.papel = 'titular'
    LIMIT 1
  ) pc ON true
  WHERE p.empresa_id = p_empresa_id
    AND p.modalidade = 'Contrato'
    AND p.status_emissao = 'emitido'
    AND p.data_emissao IS NOT NULL
    AND EXTRACT(MONTH FROM p.data_emissao) = p_mes
    AND EXTRACT(YEAR  FROM p.data_emissao) = p_ano

  ORDER BY data_emissao DESC;
END;
$$;

-- de 20260911_301_comissoes_padrao_faixas_de_valor.sql:992
CREATE OR REPLACE FUNCTION garantir_conta_receber_processo(
  p_processo_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_empresa_id  UUID;
  v_proc        RECORD;
  v_existing_id UUID;
  v_pct         NUMERIC;
  v_teto_comissao NUMERIC;
  v_origem      TEXT;
  v_valor_base  NUMERIC;
  v_valor_calc  NUMERIC;
  v_fechamento_id UUID;
  v_new_id      UUID;
BEGIN
  SELECT u.empresa_id INTO v_empresa_id FROM usuarios u WHERE u.id = auth.uid() AND u.ativo = true;
  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT id INTO v_existing_id
  FROM financeiro_contas_receber
  WHERE processo_id = p_processo_id AND empresa_id = v_empresa_id
  ORDER BY created_at DESC LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN v_existing_id;
  END IF;

  SELECT
    p.*,
    COALESCE(pc.nome, pe.nome, '') AS cliente_nome
  INTO v_proc
  FROM processos p
  LEFT JOIN pessoas pe ON pe.id = p.pessoa_id
  LEFT JOIN LATERAL (
    SELECT tp.nome FROM participacoes tpa
    JOIN pessoas tp ON tp.id = tpa.pessoa_id
    WHERE tpa.processo_id = p.id AND tpa.papel = 'titular'
    LIMIT 1
  ) pc ON true
  WHERE p.id = p_processo_id AND p.empresa_id = v_empresa_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Processo não encontrado ou acesso negado';
  END IF;

  IF v_proc.modalidade = 'Contrato' THEN
    -- Correção deliberada nesta migration: a 296 zerava valor_previsto
    -- aqui (v_valor_calc = v_valor_base * 0 / 100 = 0), inconsistente com
    -- contas_a_receber_mes_vivo (que já usava valor_contrato cheio pra
    -- Contrato). Alinhado ao valor real esperado.
    v_origem := 'contrato';
    v_valor_base := COALESCE(v_proc.valor_contrato, 0);
    v_pct := 0;
    v_valor_calc := v_valor_base;
  ELSE
    v_origem := 'emissao';
    v_valor_base := COALESCE(v_proc.valor_financiado, 0);

    SELECT COALESCE(cp.comissao_empresa, 0), COALESCE(cp.valor_maximo_comissao, 0)
    INTO v_pct, v_teto_comissao
    FROM comissoes_padrao cp
    WHERE cp.empresa_id = v_empresa_id AND cp.banco_id = v_proc.banco_id
      AND (cp.modalidade = '' OR cp.modalidade = v_proc.modalidade::TEXT)
      AND v_valor_base >= cp.piso_valor
      AND (cp.teto_valor = 0 OR v_valor_base <= cp.teto_valor)
    ORDER BY (cp.modalidade <> '') DESC, cp.piso_valor DESC
    LIMIT 1;

    IF NOT FOUND THEN v_pct := 0; v_teto_comissao := 0; END IF;

    v_valor_calc := ROUND(v_valor_base * v_pct / 100, 2);
    IF v_teto_comissao > 0 THEN
      v_valor_calc := LEAST(v_valor_calc, v_teto_comissao);
    END IF;
  END IF;

  SELECT f.id INTO v_fechamento_id
  FROM financeiro_fechamentos f
  WHERE f.empresa_id = v_empresa_id
    AND f.competencia_mes = EXTRACT(MONTH FROM v_proc.data_emissao)
    AND f.competencia_ano = EXTRACT(YEAR FROM v_proc.data_emissao)
  LIMIT 1;

  INSERT INTO financeiro_contas_receber (
    empresa_id, fechamento_id, processo_id, banco_id, cliente_nome, origem,
    valor_base, percentual_previsto, valor_previsto, status
  ) VALUES (
    v_empresa_id, v_fechamento_id, p_processo_id, v_proc.banco_id, v_proc.cliente_nome, v_origem,
    v_valor_base, v_pct, v_valor_calc, 'a_faturar'
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

-- de 20260914_306_contrato_conta_por_data_pagamento.sql:338
CREATE OR REPLACE FUNCTION puxar_contratos(
  p_fechamento_id UUID
)
RETURNS INTEGER AS $$
DECLARE
  v_fechamento  RECORD;
  v_proc        RECORD;
  v_count       INTEGER := 0;
  v_valor       NUMERIC;
  v_fp_id       UUID;
BEGIN
  SELECT f.*, u.empresa_id AS user_empresa
  INTO v_fechamento
  FROM financeiro_fechamentos f
  JOIN usuarios u ON u.id = auth.uid()
  WHERE f.id = p_fechamento_id AND f.empresa_id = u.empresa_id AND u.ativo = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fechamento não encontrado ou acesso negado';
  END IF;

  IF v_fechamento.status = 'travado' THEN
    RAISE EXCEPTION 'Fechamento travado. Reabra antes de importar contratos.';
  END IF;

  FOR v_proc IN
    SELECT
      p.id,
      p.numero_processo,
      p.comercial_id,
      p.juridico_id,
      p.valor_contrato,
      p.data_pagamento_contrato,
      p.status_emissao,
      p.modalidade,
      COALESCE(pc.nome, pe.nome, '') AS cliente_nome
    FROM processos p
    LEFT JOIN pessoas pe ON pe.id = p.pessoa_id
    LEFT JOIN LATERAL (
      SELECT tp.nome FROM participacoes tpa
      JOIN pessoas tp ON tp.id = tpa.pessoa_id
      WHERE tpa.processo_id = p.id AND tpa.papel = 'titular'
      LIMIT 1
    ) pc ON true
    WHERE p.empresa_id = v_fechamento.empresa_id
      AND p.modalidade = 'Contrato'
      AND p.data_pagamento_contrato IS NOT NULL
      AND EXTRACT(MONTH FROM p.data_pagamento_contrato) = v_fechamento.competencia_mes
      AND EXTRACT(YEAR  FROM p.data_pagamento_contrato) = v_fechamento.competencia_ano
      AND NOT EXISTS (
        SELECT 1 FROM financeiro_fechamento_processos fp
        WHERE fp.processo_id = p.id AND fp.fechamento_id = p_fechamento_id
      )
  LOOP
    v_valor := COALESCE(v_proc.valor_contrato, 0);

    INSERT INTO financeiro_fechamento_processos (
      fechamento_id, empresa_id, processo_id, cliente_nome, banco_id, modalidade,
      valor_financiado, data_emissao, comercial_id, operacional_id, status_origem
    ) VALUES (
      p_fechamento_id, v_fechamento.empresa_id, v_proc.id, v_proc.cliente_nome,
      NULL, 'Contrato', v_valor, v_proc.data_pagamento_contrato,
      v_proc.comercial_id, v_proc.juridico_id, v_proc.status_emissao
    )
    RETURNING id INTO v_fp_id;

    INSERT INTO financeiro_contas_receber (
      empresa_id, fechamento_id, processo_id, banco_id, cliente_nome, origem,
      valor_base, percentual_previsto, valor_previsto, status
    ) VALUES (
      v_fechamento.empresa_id, p_fechamento_id, v_proc.id, NULL, v_proc.cliente_nome,
      'contrato', v_valor, 0, v_valor,
      'a_faturar'
    );

    IF v_proc.comercial_id IS NULL THEN
      INSERT INTO financeiro_conferencias (
        empresa_id, fechamento_id, tipo, severidade, status, titulo, descricao,
        entidade_tipo, entidade_id
      ) VALUES (
        v_fechamento.empresa_id, p_fechamento_id, 'processo_sem_comercial', 'alerta', 'pendente',
        'Contrato sem comercial', 'O contrato não possui comercial vinculado.',
        'financeiro_fechamento_processos', v_fp_id
      ) ON CONFLICT DO NOTHING;
    END IF;

    IF v_valor = 0 THEN
      INSERT INTO financeiro_conferencias (
        empresa_id, fechamento_id, tipo, severidade, status, titulo, descricao,
        entidade_tipo, entidade_id
      ) VALUES (
        v_fechamento.empresa_id, p_fechamento_id, 'valor_negativo', 'critico', 'pendente',
        'Contrato sem valor', 'O campo valor_contrato está vazio ou zero. Verifique o processo.',
        'financeiro_fechamento_processos', v_fp_id
      ) ON CONFLICT DO NOTHING;
    END IF;

    v_count := v_count + 1;
  END LOOP;

  UPDATE financeiro_fechamentos
  SET status = 'em_conferencia', updated_at = now()
  WHERE id = p_fechamento_id AND status = 'rascunho';

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- de 20260911_301_comissoes_padrao_faixas_de_valor.sql:522
CREATE OR REPLACE FUNCTION puxar_processos_emitidos(
  p_fechamento_id UUID
)
RETURNS INTEGER AS $$
DECLARE
  v_fechamento    RECORD;
  v_proc          RECORD;
  v_pct_empresa   NUMERIC;
  v_teto_empresa  NUMERIC;
  v_valor_previsto NUMERIC;
  v_count         INTEGER := 0;
BEGIN
  SELECT f.*, u.empresa_id AS user_empresa
  INTO v_fechamento
  FROM financeiro_fechamentos f
  JOIN usuarios u ON u.id = auth.uid()
  WHERE f.id = p_fechamento_id AND f.empresa_id = u.empresa_id AND u.ativo = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fechamento não encontrado ou acesso negado';
  END IF;

  IF v_fechamento.status = 'travado' THEN
    RAISE EXCEPTION 'Fechamento travado. Reabra antes de puxar processos.';
  END IF;

  FOR v_proc IN
    SELECT
      p.id,
      p.numero_processo,
      p.banco_id,
      p.comercial_id,
      p.operacional_id,
      p.valor_financiado,
      p.valor_assessoria,
      p.data_emissao,
      p.status_emissao,
      p.modalidade,
      COALESCE(pc.nome, pe.nome, '') AS cliente_nome
    FROM processos p
    LEFT JOIN pessoas pe ON pe.id = p.pessoa_id
    LEFT JOIN LATERAL (
      SELECT tp.nome FROM participacoes tpa
      JOIN pessoas tp ON tp.id = tpa.pessoa_id
      WHERE tpa.processo_id = p.id AND tpa.papel = 'titular'
      LIMIT 1
    ) pc ON true
    WHERE p.empresa_id = v_fechamento.empresa_id
      AND p.status_emissao = 'emitido'
      AND p.modalidade NOT IN ('Contrato', 'Consorcio')
      AND EXTRACT(MONTH FROM p.data_emissao) = v_fechamento.competencia_mes
      AND EXTRACT(YEAR  FROM p.data_emissao) = v_fechamento.competencia_ano
      AND NOT EXISTS (
        SELECT 1 FROM financeiro_fechamento_processos fp
        WHERE fp.processo_id = p.id AND fp.fechamento_id = p_fechamento_id
      )
  LOOP
    SELECT cp.comissao_empresa, cp.valor_maximo_comissao
    INTO v_pct_empresa, v_teto_empresa
    FROM comissoes_padrao cp
    WHERE cp.empresa_id = v_fechamento.empresa_id AND cp.banco_id = v_proc.banco_id
      AND (cp.modalidade = '' OR cp.modalidade = v_proc.modalidade)
      AND COALESCE(v_proc.valor_financiado, 0) >= cp.piso_valor
      AND (cp.teto_valor = 0 OR COALESCE(v_proc.valor_financiado, 0) <= cp.teto_valor)
    ORDER BY (cp.modalidade <> '') DESC, cp.piso_valor DESC
    LIMIT 1;

    IF NOT FOUND THEN v_pct_empresa := 0; v_teto_empresa := 0; END IF;

    v_valor_previsto := ROUND(COALESCE(v_proc.valor_financiado, 0) * COALESCE(v_pct_empresa, 0) / 100, 2);
    IF COALESCE(v_teto_empresa, 0) > 0 THEN
      v_valor_previsto := LEAST(v_valor_previsto, v_teto_empresa);
    END IF;

    INSERT INTO financeiro_fechamento_processos (
      fechamento_id, empresa_id, processo_id, cliente_nome, banco_id, modalidade,
      valor_financiado, valor_assessoria, data_emissao, comercial_id, operacional_id, status_origem
    ) VALUES (
      p_fechamento_id, v_fechamento.empresa_id, v_proc.id, v_proc.cliente_nome,
      v_proc.banco_id, v_proc.modalidade, v_proc.valor_financiado, COALESCE(v_proc.valor_assessoria, 0),
      v_proc.data_emissao, v_proc.comercial_id, v_proc.operacional_id, v_proc.status_emissao
    );

    INSERT INTO financeiro_contas_receber (
      empresa_id, fechamento_id, processo_id, banco_id, cliente_nome, origem,
      valor_base, percentual_previsto, valor_previsto, status
    ) VALUES (
      v_fechamento.empresa_id, p_fechamento_id, v_proc.id, v_proc.banco_id, v_proc.cliente_nome,
      'emissao', COALESCE(v_proc.valor_financiado, 0), COALESCE(v_pct_empresa, 0),
      v_valor_previsto,
      'a_faturar'
    );

    IF v_proc.comercial_id IS NULL THEN
      INSERT INTO financeiro_conferencias (
        empresa_id, fechamento_id, tipo, severidade, status, titulo, descricao,
        entidade_tipo, entidade_id
      ) VALUES (
        v_fechamento.empresa_id, p_fechamento_id, 'processo_sem_comercial', 'alerta', 'pendente',
        'Processo sem comercial', 'O processo não possui comercial vinculado.',
        'financeiro_fechamento_processos', v_proc.id
      ) ON CONFLICT DO NOTHING;
    END IF;

    IF v_proc.operacional_id IS NULL THEN
      INSERT INTO financeiro_conferencias (
        empresa_id, fechamento_id, tipo, severidade, status, titulo, descricao,
        entidade_tipo, entidade_id
      ) VALUES (
        v_fechamento.empresa_id, p_fechamento_id, 'processo_sem_operacional', 'info', 'pendente',
        'Processo sem operacional', 'O processo não possui operacional vinculado.',
        'financeiro_fechamento_processos', v_proc.id
      ) ON CONFLICT DO NOTHING;
    END IF;

    v_count := v_count + 1;
  END LOOP;

  UPDATE financeiro_fechamentos
  SET status = 'em_conferencia', updated_at = now()
  WHERE id = p_fechamento_id AND status = 'rascunho';

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
