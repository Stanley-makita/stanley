-- Correção pontual (10/11/2026): cliente JAQUELINE CORDEIRO RIBEIRO DE MACENA com 2 cadastros duplicados.
--
-- Real (CPF 068.087.449-63, lead 49fb62b9):  081270d0-2ab4-4127-a3fc-8526fee89acd
-- Duplicado sem CPF/lead (28/10, holerite):  7f95108b-e883-4a2a-a295-1139bb1169a2  ← recebeu os 8 docs do *salva de 09/11
-- Duplicado sem CPF/lead (28/10, extrato):   3433a2e8-2024-4d08-9a82-d9e0522cebd9  ("R. DE MACENA")
--
-- 1. merge_pessoas (migration 332/333) traz tudo dos duplicados para a real numa transação: documentos,
--    histórico; dados só preenchem o que a real NÃO tem (ela já tem tudo — nada dos duplicados entra).
-- 2. Os 8 documentos de 09/11 não tinham vínculo com o lead ("Sem lead aberto") → vincula, "Sem pasta".
-- 3. Histórico no lead.
-- Rodar uma vez no SQL Editor de PRODUÇÃO. A conferência no fim deve mostrar: 1 pessoa, 0 docs sem vínculo.

BEGIN;

SELECT merge_pessoas('081270d0-2ab4-4127-a3fc-8526fee89acd', '7f95108b-e883-4a2a-a295-1139bb1169a2',
                     '35f2c190-c358-4b36-85ea-1f1bacbe70af', NULL);
SELECT merge_pessoas('081270d0-2ab4-4127-a3fc-8526fee89acd', '3433a2e8-2024-4d08-9a82-d9e0522cebd9',
                     '35f2c190-c358-4b36-85ea-1f1bacbe70af', NULL);

INSERT INTO documento_vinculos (empresa_id, documento_id, entidade_tipo, entidade_id)
SELECT d.empresa_id, d.id, 'lead', '49fb62b9-bea6-4db9-9ab6-234b22d578b4'
FROM documentos d
WHERE d.pessoa_id = '081270d0-2ab4-4127-a3fc-8526fee89acd'
  AND d.deleted_at IS NULL
  AND d.recebido_em >= '2026-11-09'
  AND NOT EXISTS (SELECT 1 FROM documento_vinculos v
                  WHERE v.documento_id = d.id AND v.entidade_tipo = 'lead'
                    AND v.entidade_id = '49fb62b9-bea6-4db9-9ab6-234b22d578b4');

INSERT INTO lead_historico (lead_id, empresa_id, tipo, descricao)
VALUES ('49fb62b9-bea6-4db9-9ab6-234b22d578b4', '35f2c190-c358-4b36-85ea-1f1bacbe70af', 'acao_operacional',
        'Correção: 2 cadastros duplicados da cliente (criados em 28/10 pelo "Extrair dados" de holerite/extrato) '
        || 'foram mesclados neste cadastro; os 8 documentos enviados por *salva em 09/11 foram vinculados a este lead (Sem pasta).');

COMMIT;

-- Conferência (esperado: pessoas = 1, docs_sem_vinculo = 0)
SELECT
  (SELECT count(*) FROM pessoas WHERE empresa_id = '35f2c190-c358-4b36-85ea-1f1bacbe70af'
     AND deleted_at IS NULL AND nome ILIKE '%jaqueline cordeiro%') AS pessoas,
  (SELECT count(*) FROM documentos d WHERE d.pessoa_id = '081270d0-2ab4-4127-a3fc-8526fee89acd' AND d.deleted_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM documento_vinculos v WHERE v.documento_id = d.id AND v.entidade_tipo = 'lead')) AS docs_sem_vinculo,
  (SELECT count(*) FROM documentos d WHERE d.pessoa_id = '081270d0-2ab4-4127-a3fc-8526fee89acd' AND d.deleted_at IS NULL) AS docs_total;
