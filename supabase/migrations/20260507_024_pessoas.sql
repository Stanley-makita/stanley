-- Migration: entidade Pessoa — fundação da arquitetura pessoa-cêntrica
-- Sprint 1: schema + backfill. Todas as colunas novas são nullable para zero breaking changes.

-- ── Tabela central: pessoas ───────────────────────────────────────────────────
CREATE TABLE pessoas (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID        NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
  nome            TEXT        NOT NULL,
  cpf             TEXT,
  data_nascimento DATE,
  email           TEXT,
  observacoes     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, cpf)
);

ALTER TABLE pessoas ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_pessoas_empresa ON pessoas(empresa_id);
CREATE INDEX idx_pessoas_nome    ON pessoas(empresa_id, nome);

CREATE TRIGGER pessoas_set_updated_at
  BEFORE UPDATE ON pessoas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE POLICY "pessoas_empresa" ON pessoas
  FOR ALL USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
  );

CREATE POLICY "pessoas_service" ON pessoas
  FOR ALL TO service_role USING (true);

-- ── Tabela de telefones por pessoa ────────────────────────────────────────────
CREATE TABLE pessoa_telefones (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  pessoa_id   UUID        NOT NULL REFERENCES pessoas(id) ON DELETE CASCADE,
  empresa_id  UUID        NOT NULL REFERENCES empresas(id),
  telefone    TEXT        NOT NULL,
  whatsapp    BOOLEAN     NOT NULL DEFAULT true,
  principal   BOOLEAN     NOT NULL DEFAULT false,
  ativo       BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pessoa_id, telefone)
);

ALTER TABLE pessoa_telefones ENABLE ROW LEVEL SECURITY;

-- Índice de lookup para o webhook: busca rápida por empresa + telefone
CREATE UNIQUE INDEX idx_pessoa_telefones_lookup
  ON pessoa_telefones(empresa_id, telefone)
  WHERE ativo = true;

CREATE POLICY "pessoa_telefones_empresa" ON pessoa_telefones
  FOR ALL USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
  );

CREATE POLICY "pessoa_telefones_service" ON pessoa_telefones
  FOR ALL TO service_role USING (true);

-- ── Colunas pessoa_id nas tabelas existentes (nullable = zero breaking change) ─
ALTER TABLE leads               ADD COLUMN IF NOT EXISTS pessoa_id UUID REFERENCES pessoas(id);
ALTER TABLE conversas           ADD COLUMN IF NOT EXISTS pessoa_id UUID REFERENCES pessoas(id);
ALTER TABLE processo_compradores ADD COLUMN IF NOT EXISTS pessoa_id UUID REFERENCES pessoas(id);
ALTER TABLE processo_vendedores  ADD COLUMN IF NOT EXISTS pessoa_id UUID REFERENCES pessoas(id);

CREATE INDEX idx_leads_pessoa_id       ON leads(pessoa_id)    WHERE pessoa_id IS NOT NULL;
CREATE INDEX idx_conversas_pessoa_id   ON conversas(pessoa_id) WHERE pessoa_id IS NOT NULL;

-- ── Backfill Sprint 1 ─────────────────────────────────────────────────────────
-- Estratégia: uma pessoa por (empresa_id, telefone) deduplica leads com mesmo número.
-- Usamos o nome do lead mais recente como nome da pessoa.

-- 1. Cria pessoas a partir dos leads, deduplicando por telefone
WITH leads_dedup AS (
  SELECT DISTINCT ON (empresa_id, telefone)
    empresa_id,
    telefone,
    nome,
    cpf,
    email,
    created_at
  FROM leads
  WHERE deleted_at IS NULL
    AND telefone IS NOT NULL
    AND telefone != ''
  ORDER BY empresa_id, telefone, created_at DESC
),
inserted AS (
  INSERT INTO pessoas (empresa_id, nome, cpf, email)
  SELECT empresa_id, nome, cpf, email
  FROM leads_dedup
  ON CONFLICT DO NOTHING
  RETURNING id, empresa_id, nome
)
-- 2. Popula pessoa_telefones para as pessoas recém-criadas
INSERT INTO pessoa_telefones (pessoa_id, empresa_id, telefone, principal)
SELECT p.id, ld.empresa_id, ld.telefone, true
FROM leads_dedup ld
JOIN pessoas p ON p.empresa_id = ld.empresa_id AND p.nome = ld.nome
ON CONFLICT (pessoa_id, telefone) DO NOTHING;

-- 3. Vincula leads às suas pessoas pelo telefone
UPDATE leads l
SET pessoa_id = pt.pessoa_id
FROM pessoa_telefones pt
WHERE l.pessoa_id IS NULL
  AND l.empresa_id = pt.empresa_id
  AND l.telefone = pt.telefone;

-- 4. Vincula conversas às suas pessoas pelo telefone
UPDATE conversas c
SET pessoa_id = pt.pessoa_id
FROM pessoa_telefones pt
WHERE c.pessoa_id IS NULL
  AND c.empresa_id = pt.empresa_id
  AND c.contato_telefone IS NOT NULL
  AND c.contato_telefone = pt.telefone;
