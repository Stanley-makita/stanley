-- ============================================================
-- Migration 324: Participantes V2 — tabelas (spec 2026-09-28-participantes-v2-design.md)
-- Participação = Pessoa numa proposta (lead OU processo) com papel.
-- Relacionamento Pessoal = casal (vale pra qualquer proposta).
-- Sem política de INSERT/UPDATE/DELETE: só service role e funções pv2_* gravam.
-- ============================================================

CREATE OR REPLACE FUNCTION cpf_valido(p text) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE d text := regexp_replace(coalesce(p, ''), '\D', '', 'g'); s int; r int; i int;
BEGIN
  IF length(d) <> 11 OR d ~ '^(\d)\1{10}$' THEN RETURN false; END IF;
  s := 0; FOR i IN 1..9 LOOP s := s + substr(d, i, 1)::int * (11 - i); END LOOP;
  r := (s * 10) % 11; IF r = 10 THEN r := 0; END IF;
  IF r <> substr(d, 10, 1)::int THEN RETURN false; END IF;
  s := 0; FOR i IN 1..10 LOOP s := s + substr(d, i, 1)::int * (12 - i); END LOOP;
  r := (s * 10) % 11; IF r = 10 THEN r := 0; END IF;
  RETURN r = substr(d, 11, 1)::int;
END $$;

-- Mesma comparação da migration 314 (telefone canônico do usuário interno ativo).
CREATE OR REPLACE FUNCTION pessoa_e_de_operador(p_pessoa_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM pessoa_telefones pt
    JOIN usuarios u ON u.empresa_id = pt.empresa_id AND u.ativo = true
    WHERE pt.pessoa_id = p_pessoa_id AND pt.ativo = true
      AND (
        (u.telefone_whatsapp IS NOT NULL AND telefone_canonico_br(u.telefone_whatsapp) = telefone_canonico_br(pt.telefone))
        OR (u.telefone IS NOT NULL AND telefone_canonico_br(u.telefone) = telefone_canonico_br(pt.telefone))
      )
  );
$$;

CREATE TABLE IF NOT EXISTS pessoa_relacionamentos (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   UUID        NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  pessoa_a_id  UUID        NOT NULL REFERENCES pessoas(id)  ON DELETE CASCADE,
  pessoa_b_id  UUID        NOT NULL REFERENCES pessoas(id)  ON DELETE CASCADE,
  tipo         TEXT        NOT NULL CHECK (tipo IN ('casamento', 'uniao_estavel')),
  regime_bens  TEXT,       -- mesmo domínio de pessoas.regime_casamento; validado na aplicação
  data_inicio  DATE,
  data_fim     DATE,       -- null = vigente
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT rel_par_ordenado CHECK (pessoa_a_id < pessoa_b_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_rel_par_vigente ON pessoa_relacionamentos (pessoa_a_id, pessoa_b_id) WHERE data_fim IS NULL;
CREATE INDEX IF NOT EXISTS idx_rel_pessoa_a ON pessoa_relacionamentos (pessoa_a_id) WHERE data_fim IS NULL;
CREATE INDEX IF NOT EXISTS idx_rel_pessoa_b ON pessoa_relacionamentos (pessoa_b_id) WHERE data_fim IS NULL;

CREATE OR REPLACE FUNCTION fn_relacionamento_um_vigente() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.data_fim IS NOT NULL THEN RETURN NEW; END IF;
  -- trava as duas pessoas (sempre na mesma ordem) contra corrida
  PERFORM pg_advisory_xact_lock(hashtext(NEW.pessoa_a_id::text));
  PERFORM pg_advisory_xact_lock(hashtext(NEW.pessoa_b_id::text));
  IF EXISTS (
    SELECT 1 FROM pessoa_relacionamentos r
    WHERE r.id <> NEW.id AND r.data_fim IS NULL
      AND (r.pessoa_a_id IN (NEW.pessoa_a_id, NEW.pessoa_b_id) OR r.pessoa_b_id IN (NEW.pessoa_a_id, NEW.pessoa_b_id))
  ) THEN
    RAISE EXCEPTION 'pessoa_ja_tem_relacionamento_vigente' USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_relacionamento_um_vigente ON pessoa_relacionamentos;
CREATE TRIGGER trg_relacionamento_um_vigente BEFORE INSERT OR UPDATE ON pessoa_relacionamentos
  FOR EACH ROW EXECUTE FUNCTION fn_relacionamento_um_vigente();
CREATE TRIGGER trg_pessoa_relacionamentos_updated_at BEFORE UPDATE ON pessoa_relacionamentos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS participacoes (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   UUID        NOT NULL REFERENCES empresas(id)  ON DELETE CASCADE,
  lead_id      UUID        REFERENCES leads(id)              ON DELETE CASCADE,
  processo_id  UUID        REFERENCES processos(id)          ON DELETE CASCADE,
  -- CASCADE: o merge de Pessoas (DELETE da duplicada) não pode travar; a sincronização
  -- recria a participação na Pessoa que ficou a partir das tabelas antigas.
  pessoa_id    UUID        NOT NULL REFERENCES pessoas(id)   ON DELETE CASCADE,
  papel        TEXT        NOT NULL CHECK (papel IN ('titular', 'coparticipante', 'conjuge_anuente', 'vendedor', 'conjuge_vendedor')),
  compoe_renda BOOLEAN     NOT NULL DEFAULT false,
  ordem        INT         NOT NULL DEFAULT 1,
  criado_por   UUID        REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT participacoes_um_alvo CHECK ((lead_id IS NULL) <> (processo_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_part_lead_pessoa     ON participacoes (lead_id, pessoa_id)     WHERE lead_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_part_processo_pessoa ON participacoes (processo_id, pessoa_id) WHERE processo_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_part_lead_titular     ON participacoes (lead_id)     WHERE lead_id IS NOT NULL AND papel = 'titular';
CREATE UNIQUE INDEX IF NOT EXISTS ux_part_processo_titular ON participacoes (processo_id) WHERE processo_id IS NOT NULL AND papel = 'titular';
CREATE INDEX IF NOT EXISTS idx_part_pessoa ON participacoes (pessoa_id);

CREATE OR REPLACE FUNCTION fn_participacao_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF pessoa_e_de_operador(NEW.pessoa_id) THEN
    RAISE EXCEPTION 'pessoa_de_operador';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pessoas WHERE id = NEW.pessoa_id AND empresa_id = NEW.empresa_id) THEN
    RAISE EXCEPTION 'pessoa_de_outra_empresa';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_participacao_guard ON participacoes;
CREATE TRIGGER trg_participacao_guard BEFORE INSERT OR UPDATE OF pessoa_id, empresa_id ON participacoes
  FOR EACH ROW EXECUTE FUNCTION fn_participacao_guard();
CREATE TRIGGER trg_participacoes_updated_at BEFORE UPDATE ON participacoes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE participacoes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE pessoa_relacionamentos ENABLE ROW LEVEL SECURITY;

-- Leitura: quem enxerga o lead/processo (RLS deles decide a carteira) enxerga os participantes.
CREATE POLICY "participacoes_select" ON participacoes FOR SELECT USING (
  empresa_id = usuario_atual_empresa_id()
  AND (
    (lead_id IS NOT NULL AND EXISTS (SELECT 1 FROM leads l WHERE l.id = participacoes.lead_id))
    OR (processo_id IS NOT NULL AND EXISTS (SELECT 1 FROM processos p WHERE p.id = participacoes.processo_id))
  )
);
-- Leitura: quem enxerga uma das duas pessoas enxerga o casal.
CREATE POLICY "pessoa_relacionamentos_select" ON pessoa_relacionamentos FOR SELECT USING (
  empresa_id = usuario_atual_empresa_id()
  AND (
    EXISTS (SELECT 1 FROM pessoas p WHERE p.id = pessoa_relacionamentos.pessoa_a_id)
    OR EXISTS (SELECT 1 FROM pessoas p WHERE p.id = pessoa_relacionamentos.pessoa_b_id)
  )
);
