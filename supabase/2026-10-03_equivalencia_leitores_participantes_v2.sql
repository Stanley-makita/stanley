-- ============================================================
-- Participantes V2 — Fase B1: equivalência dos leitores SQL (SÓ LEITURA).
-- Rodar ANTES da migration 328. Lista todo negócio cujo "cliente" muda quando
-- os relatórios passam de processo_compradores (principal) para a Pessoa do
-- titular em participacoes. Esperado: só os 3 negócios sem titular conhecidos
-- (1 Pessoa excluída, 2 pessoas de operador) + negócios cujo nome copiado em
-- processo_compradores difere do nome atual da Pessoa (a Pessoa passa a valer).
-- ============================================================

-- Bloco 1: nome do cliente, antigo × novo
WITH antigo AS (
  SELECT p.id,
    (SELECT pcomp.nome FROM processo_compradores pcomp
      WHERE pcomp.processo_id = p.id
      ORDER BY pcomp.principal DESC NULLS LAST, pcomp.created_at ASC LIMIT 1) AS nome
  FROM processos p WHERE p.deleted_at IS NULL
), novo AS (
  SELECT p.id,
    (SELECT tp.nome FROM participacoes tpa JOIN pessoas tp ON tp.id = tpa.pessoa_id
      WHERE tpa.processo_id = p.id AND tpa.papel = 'titular' LIMIT 1) AS nome
  FROM processos p WHERE p.deleted_at IS NULL
)
SELECT pr.numero_processo, pr.status_emissao, a.nome AS cliente_antigo, n.nome AS cliente_novo,
       CASE WHEN n.nome IS NULL THEN 'sem titular (cai em processos.pessoa_id)' ELSE 'nome da Pessoa difere do copiado' END AS motivo
FROM antigo a JOIN novo n USING (id) JOIN processos pr ON pr.id = a.id
WHERE a.nome IS DISTINCT FROM n.nome
ORDER BY pr.numero_processo;

-- Bloco 2: pessoas ligadas a processo, antigo (processo_compradores) × novo (participações de compra)
WITH antigo AS (
  SELECT DISTINCT processo_id, pessoa_id FROM processo_compradores WHERE pessoa_id IS NOT NULL
), novo AS (
  SELECT DISTINCT processo_id, pessoa_id FROM participacoes
  WHERE processo_id IS NOT NULL AND papel IN ('titular', 'coparticipante', 'conjuge_anuente')
)
SELECT 'só no antigo' AS lado, pr.numero_processo, pe.nome
FROM antigo a JOIN processos pr ON pr.id = a.processo_id JOIN pessoas pe ON pe.id = a.pessoa_id
WHERE NOT EXISTS (SELECT 1 FROM novo n WHERE n.processo_id = a.processo_id AND n.pessoa_id = a.pessoa_id)
UNION ALL
SELECT 'só no novo', pr.numero_processo, pe.nome
FROM novo n JOIN processos pr ON pr.id = n.processo_id JOIN pessoas pe ON pe.id = n.pessoa_id
WHERE NOT EXISTS (SELECT 1 FROM antigo a WHERE a.processo_id = n.processo_id AND a.pessoa_id = n.pessoa_id)
ORDER BY 1, 2;
-- Bloco 2 esperado: "só no antigo" = pessoas excluídas/de operador; "só no novo" = cônjuges
-- anuentes (vêm do Relacionamento, nunca estiveram em processo_compradores) — a busca de
-- pessoas passa a mostrar o negócio também na Pessoa do cônjuge.
