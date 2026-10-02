-- Diagnóstico da migration 335 (SÓ LEITURA): negócios ativos cujo comprador principal tem casamento
-- VIGENTE e o cônjuge ainda NÃO está no negócio — são exatamente os que vão ganhar o cônjuge
-- (conjuge_anuente). Rodar ANTES da 335, no staging e na produção.
SELECT pr.numero_processo, pr.modalidade,
       t.nome  AS comprador_principal,
       c.nome  AS conjuge_que_vai_entrar,
       (coalesce(c.renda_formal, 0) + coalesce(c.renda_informal, 0)) > 0 AS vai_compor_renda
FROM processos pr
JOIN pessoas t ON t.id = pr.pessoa_id
JOIN pessoa_relacionamentos rel ON rel.data_fim IS NULL AND pr.pessoa_id IN (rel.pessoa_a_id, rel.pessoa_b_id)
JOIN pessoas c ON c.id = (CASE WHEN rel.pessoa_a_id = pr.pessoa_id THEN rel.pessoa_b_id ELSE rel.pessoa_a_id END)
WHERE pr.deleted_at IS NULL AND c.deleted_at IS NULL AND c.empresa_id = pr.empresa_id
  AND NOT pessoa_e_de_operador(c.id)
  AND NOT EXISTS (SELECT 1 FROM participacoes pa WHERE pa.processo_id = pr.id AND pa.pessoa_id = c.id)
ORDER BY pr.numero_processo;
