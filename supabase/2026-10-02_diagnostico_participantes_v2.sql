-- Diagnóstico Participantes V2 — SÓ LEITURA. Rodar cada bloco e revisar com o usuário ANTES do backfill.
-- Dependências: Requer migration 324 (funções cpf_valido, pessoa_e_de_operador) rodada antes.

-- 1. Renda divergente entre lead e Pessoa titular (backfill: Pessoa vence; nula recebe do lead)
SELECT l.id AS lead_id, l.nome, l.renda_formal AS lead_formal, p.renda_formal AS pessoa_formal,
       l.renda_informal AS lead_informal, p.renda_informal AS pessoa_informal
FROM leads l JOIN pessoas p ON p.id = l.pessoa_id
WHERE l.deleted_at IS NULL
  AND ((l.renda_formal IS NOT NULL AND p.renda_formal IS NOT NULL AND l.renda_formal <> p.renda_formal)
    OR (l.renda_informal IS NOT NULL AND p.renda_informal IS NOT NULL AND l.renda_informal <> p.renda_informal));

-- 2. Cônjuge só em campos soltos (vai virar Pessoa). cpf_ok = false → CPF será descartado.
-- DEPENDE DE: migration 324 (cpf_valido)
SELECT 'lead' AS origem, l.id, l.conjuge_nome, l.conjuge_cpf, cpf_valido(l.conjuge_cpf) AS cpf_ok
FROM leads l LEFT JOIN pessoas p ON p.id = l.pessoa_id
WHERE l.deleted_at IS NULL AND l.conjuge_pessoa_id IS NULL AND p.conjuge_pessoa_id IS NULL
  AND (coalesce(trim(l.conjuge_nome), '') <> '' OR l.conjuge_cpf IS NOT NULL)
UNION ALL
SELECT 'pessoa', p.id, p.conjuge_nome, p.conjuge_cpf, cpf_valido(p.conjuge_cpf)
FROM pessoas p
WHERE p.deleted_at IS NULL AND p.conjuge_pessoa_id IS NULL
  AND (coalesce(trim(p.conjuge_nome), '') <> '' OR p.conjuge_cpf IS NOT NULL);

-- 3. Estado civil não-casado mas com cônjuge preenchido (NÃO vira relacionamento)
SELECT id, nome, estado_civil, conjuge_nome, conjuge_pessoa_id FROM pessoas
WHERE deleted_at IS NULL AND coalesce(estado_civil, '') NOT IN ('casado', 'uniao_estavel')
  AND (conjuge_pessoa_id IS NOT NULL OR coalesce(trim(conjuge_nome), '') <> '');

-- 4. Compradores/vendedores de negócio sem Pessoa (vão ganhar Pessoa; CPF inválido descartado)
-- DEPENDE DE: migration 324 (cpf_valido)
SELECT 'comprador' AS tipo, id, processo_id, nome, cpf, cpf_valido(cpf) AS cpf_ok FROM processo_compradores WHERE pessoa_id IS NULL
UNION ALL
SELECT 'vendedor', id, processo_id, nome, cpf, cpf_valido(cpf) FROM processo_vendedores WHERE pessoa_id IS NULL;

-- 5. Cônjuge não recíproco / casamentos em conflito (A→B mas B→C)
SELECT a.id AS pessoa, a.nome, a.conjuge_pessoa_id AS conjuge_de_a, b.conjuge_pessoa_id AS conjuge_de_b
FROM pessoas a JOIN pessoas b ON b.id = a.conjuge_pessoa_id
WHERE a.deleted_at IS NULL AND b.conjuge_pessoa_id IS NOT NULL AND b.conjuge_pessoa_id <> a.id;

-- 6. Regime/data de casamento divergentes entre os dois cônjuges (backfill usa o valor de quem for processado primeiro; revisar)
SELECT a.id, a.nome, a.regime_casamento, a.data_casamento, b.id AS conjuge, b.nome AS nome_conjuge, b.regime_casamento AS regime_conjuge, b.data_casamento AS data_conjuge
FROM pessoas a JOIN pessoas b ON b.id = a.conjuge_pessoa_id
WHERE a.deleted_at IS NULL AND a.id < b.id
  AND ((a.regime_casamento IS NOT NULL AND b.regime_casamento IS NOT NULL AND a.regime_casamento <> b.regime_casamento)
    OR (a.data_casamento IS NOT NULL AND b.data_casamento IS NOT NULL AND a.data_casamento <> b.data_casamento));

-- 7. Pessoa de operador em qualquer lista de participante (será IGNORADA pelo backfill)
-- DEPENDE DE: migration 324 (pessoa_e_de_operador)
SELECT 'lead titular' AS onde, l.id, p.nome FROM leads l JOIN pessoas p ON p.id = l.pessoa_id WHERE l.deleted_at IS NULL AND pessoa_e_de_operador(p.id)
UNION ALL SELECT 'lead cônjuge', l.id, p.nome FROM leads l JOIN pessoas p ON p.id = l.conjuge_pessoa_id WHERE l.deleted_at IS NULL AND pessoa_e_de_operador(p.id)
UNION ALL SELECT 'lead coparticipante', c.lead_id, p.nome FROM lead_coparticipantes c JOIN pessoas p ON p.id = c.pessoa_id WHERE pessoa_e_de_operador(p.id)
UNION ALL SELECT 'processo comprador', c.processo_id, p.nome FROM processo_compradores c JOIN pessoas p ON p.id = c.pessoa_id WHERE pessoa_e_de_operador(p.id);

-- 8. Processos com mais de um "principal" ou nenhum
SELECT processo_id, count(*) FILTER (WHERE principal) AS principais, count(*) AS compradores
FROM processo_compradores GROUP BY processo_id HAVING count(*) FILTER (WHERE principal) <> 1;

-- 9. Valores de regime fora do domínio da tela (comunhao_parcial, comunhao_total, separacao_total, participacao_final)
SELECT regime_casamento, count(*) FROM pessoas
WHERE regime_casamento IS NOT NULL AND regime_casamento NOT IN ('comunhao_parcial', 'comunhao_total', 'separacao_total', 'participacao_final')
GROUP BY 1;

-- 10. Cônjuge do lead diferente do cônjuge da Pessoa titular (sync usa o da Pessoa; o do lead não é sobrescrito — revisar)
SELECT l.id AS lead_id, l.nome, l.conjuge_pessoa_id AS conjuge_no_lead, cl.nome AS nome_conjuge_lead,
       p.conjuge_pessoa_id AS conjuge_na_pessoa, cp.nome AS nome_conjuge_pessoa
FROM leads l
JOIN pessoas p ON p.id = l.pessoa_id
LEFT JOIN pessoas cl ON cl.id = l.conjuge_pessoa_id
LEFT JOIN pessoas cp ON cp.id = p.conjuge_pessoa_id
WHERE l.deleted_at IS NULL
  AND l.conjuge_pessoa_id IS NOT NULL AND p.conjuge_pessoa_id IS NOT NULL
  AND l.conjuge_pessoa_id <> p.conjuge_pessoa_id;
