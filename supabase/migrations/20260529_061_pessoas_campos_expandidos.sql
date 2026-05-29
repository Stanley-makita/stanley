-- Migration: Expandir tabela pessoas com dados ricos + auditoria de alterações
-- Fase 1a: Novos campos em pessoas

ALTER TABLE pessoas
  ADD COLUMN IF NOT EXISTS rg                      TEXT,
  ADD COLUMN IF NOT EXISTS profissao               TEXT,
  ADD COLUMN IF NOT EXISTS estado_civil            TEXT
    CHECK (estado_civil IN ('solteiro','casado','uniao_estavel','divorciado','viuvo')),
  ADD COLUMN IF NOT EXISTS renda_formal            NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS renda_informal          NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS nacionalidade           TEXT,
  ADD COLUMN IF NOT EXISTS endereco_rua            TEXT,
  ADD COLUMN IF NOT EXISTS endereco_numero         TEXT,
  ADD COLUMN IF NOT EXISTS endereco_bairro         TEXT,
  ADD COLUMN IF NOT EXISTS endereco_cidade         TEXT,
  ADD COLUMN IF NOT EXISTS endereco_uf             CHAR(2),
  ADD COLUMN IF NOT EXISTS endereco_cep            TEXT,
  ADD COLUMN IF NOT EXISTS conjuge_nome            TEXT,
  ADD COLUMN IF NOT EXISTS conjuge_cpf             TEXT,
  ADD COLUMN IF NOT EXISTS conjuge_data_nascimento DATE,
  ADD COLUMN IF NOT EXISTS conjuge_telefone        TEXT,
  ADD COLUMN IF NOT EXISTS conjuge_profissao       TEXT,
  ADD COLUMN IF NOT EXISTS conjuge_renda_formal    NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS conjuge_renda_informal  NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS regime_casamento        TEXT;

-- Fase 1b: Tabela de auditoria

CREATE TABLE IF NOT EXISTS pessoas_alteracoes (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  pessoa_id           UUID        NOT NULL REFERENCES pessoas(id) ON DELETE RESTRICT,
  empresa_id          UUID        NOT NULL REFERENCES empresas(id),
  usuario_id          UUID        REFERENCES usuarios(id) ON DELETE SET NULL,
  campos_alterados    TEXT[]      NOT NULL,
  valores_anteriores  JSONB       NOT NULL DEFAULT '{}',
  valores_novos       JSONB       NOT NULL DEFAULT '{}',
  origem              TEXT        NOT NULL CHECK (origem IN ('leads','pessoas','processos')),
  alterado_em         TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE pessoas_alteracoes ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_pessoas_alt_pessoa
  ON pessoas_alteracoes(pessoa_id, alterado_em DESC);

-- Admin/gerente veem todas; outros veem apenas as próprias alterações
CREATE POLICY "pessoas_alt_select" ON pessoas_alteracoes
  FOR SELECT USING (
    empresa_id IN (
      SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true
    )
    AND (
      (SELECT perfil FROM usuarios WHERE id = auth.uid()) IN ('admin','gerente')
      OR usuario_id = (SELECT id FROM usuarios WHERE id = auth.uid())
    )
  );

CREATE POLICY "pessoas_alt_insert" ON pessoas_alteracoes
  FOR INSERT WITH CHECK (
    empresa_id IN (
      SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true
    )
  );

-- Fase 1c: Backfill — sincronizar dados existentes de leads → pessoas
-- COALESCE garante que dados já preenchidos em pessoas não são sobrescritos

UPDATE pessoas p
SET
  rg                      = COALESCE(p.rg, l.rg),
  profissao               = COALESCE(p.profissao, l.profissao),
  estado_civil            = COALESCE(p.estado_civil, l.estado_civil),
  renda_formal            = COALESCE(p.renda_formal, l.renda_formal),
  renda_informal          = COALESCE(p.renda_informal, l.renda_informal),
  conjuge_nome            = COALESCE(p.conjuge_nome, l.conjuge_nome),
  conjuge_cpf             = COALESCE(p.conjuge_cpf, l.conjuge_cpf),
  conjuge_data_nascimento = COALESCE(p.conjuge_data_nascimento, l.conjuge_data_nascimento),
  regime_casamento        = COALESCE(p.regime_casamento, l.regime_casamento)
FROM leads l
WHERE l.pessoa_id = p.id
  AND l.deleted_at IS NULL
  AND (
    l.estado_civil IS NOT NULL
    OR l.rg IS NOT NULL
    OR l.profissao IS NOT NULL
    OR l.renda_formal IS NOT NULL
    OR l.conjuge_nome IS NOT NULL
  );

-- Backfill de processo_vendedores → pessoas (estado civil + cônjuge)
UPDATE pessoas p
SET
  estado_civil = COALESCE(p.estado_civil, pv.estado_civil),
  conjuge_nome = COALESCE(p.conjuge_nome, pv.conjuge_nome),
  conjuge_cpf  = COALESCE(p.conjuge_cpf, pv.conjuge_cpf)
FROM processo_vendedores pv
WHERE pv.pessoa_id = p.id
  AND (pv.estado_civil IS NOT NULL OR pv.conjuge_nome IS NOT NULL);
