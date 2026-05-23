-- Migration: status_identidade na tabela pessoas
-- Rastreia o grau de confiança no registro de cada pessoa.

CREATE TYPE pessoa_status_identidade AS ENUM (
  'provisoria',   -- criada automaticamente por número desconhecido (sem nome validado)
  'confirmada',   -- dados mínimos validados (nome + ao menos 1 telefone ativo)
  'duplicada',    -- identificada como duplicata de outra pessoa (aguardando merge)
  'arquivada'     -- descartada após merge (registro secundário)
);

ALTER TABLE pessoas
  ADD COLUMN IF NOT EXISTS status_identidade pessoa_status_identidade NOT NULL DEFAULT 'provisoria';

-- Retroativamente: pessoas com nome real (não "Cliente") → confirmada
-- Heurística: se o nome tem mais de 5 caracteres e não é o placeholder, assume confirmado
UPDATE pessoas
SET status_identidade = 'confirmada'
WHERE LENGTH(nome) > 5
  AND nome NOT ILIKE 'cliente%'
  AND nome NOT ILIKE 'desconhecido%';

CREATE INDEX idx_pessoas_status ON pessoas(empresa_id, status_identidade);
