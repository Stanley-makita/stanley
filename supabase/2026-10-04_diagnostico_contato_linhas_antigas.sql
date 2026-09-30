-- ============================================================
-- Participantes V2 — B2a: dados de contato nas linhas antigas × Pessoa (SÓ LEITURA).
-- Rodar ANTES da migration 329. A 329 só PREENCHE campo vazio da Pessoa; as linhas
-- abaixo com "diverge" são casos em que hoje o formulário mostra o valor da linha
-- antiga e, depois da B2a, vai mostrar o da Pessoa. Revisar e corrigir na Pessoa à mão
-- os que estiverem errados.
-- ============================================================
WITH linhas AS (
  SELECT 'comprador' AS lado, pc.processo_id, pc.pessoa_id, pc.email, pc.telefone,
         NULL::text AS estado_civil, NULL::text AS banco, NULL::text AS agencia, NULL::text AS conta
  FROM processo_compradores pc WHERE pc.pessoa_id IS NOT NULL
  UNION ALL
  SELECT 'vendedor', pv.processo_id, pv.pessoa_id, pv.email, pv.telefone,
         pv.estado_civil, pv.banco, pv.agencia, pv.conta
  FROM processo_vendedores pv WHERE pv.pessoa_id IS NOT NULL
)
SELECT pr.numero_processo, l.lado, pe.nome,
  CASE WHEN nullif(trim(l.email), '') IS NULL THEN '' WHEN pe.email IS NULL THEN 'preenche' WHEN lower(trim(pe.email)) = lower(trim(l.email)) THEN '' ELSE 'diverge: ' || pe.email || ' × ' || l.email END AS email,
  CASE WHEN nullif(trim(l.telefone), '') IS NULL THEN ''
       WHEN NOT EXISTS (SELECT 1 FROM pessoa_telefones t WHERE t.pessoa_id = pe.id AND t.ativo) THEN 'preenche'
       WHEN EXISTS (SELECT 1 FROM pessoa_telefones t WHERE t.pessoa_id = pe.id AND t.ativo AND telefone_canonico_br(t.telefone) = telefone_canonico_br(l.telefone)) THEN ''
       ELSE 'diverge: ' || l.telefone END AS telefone,
  CASE WHEN nullif(trim(l.estado_civil), '') IS NULL THEN '' WHEN pe.estado_civil IS NULL THEN 'preenche' WHEN pe.estado_civil = lower(trim(l.estado_civil)) THEN '' ELSE 'diverge: ' || pe.estado_civil || ' × ' || l.estado_civil END AS estado_civil,
  CASE WHEN nullif(trim(l.banco), '') IS NULL THEN '' WHEN pe.conta_bancaria_banco IS NULL THEN 'preenche' WHEN pe.conta_bancaria_banco = l.banco THEN '' ELSE 'diverge: ' || pe.conta_bancaria_banco || ' × ' || l.banco END AS banco,
  CASE WHEN nullif(trim(l.conta), '') IS NULL THEN '' WHEN pe.conta_bancaria_numero IS NULL THEN 'preenche' WHEN pe.conta_bancaria_numero = l.conta THEN '' ELSE 'diverge: ' || pe.conta_bancaria_numero || ' × ' || l.conta END AS conta
FROM linhas l
JOIN pessoas pe ON pe.id = l.pessoa_id AND pe.deleted_at IS NULL
JOIN processos pr ON pr.id = l.processo_id AND pr.deleted_at IS NULL
WHERE NOT pessoa_e_de_operador(pe.id)
ORDER BY pr.numero_processo, l.lado;
