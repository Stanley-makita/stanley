# Participantes V2 — Fase A (modelo, migração, sincronização, leituras) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar Participação + Relacionamento Pessoal como modelo de dados, preenchê-lo com tudo que existe hoje, mantê-lo sincronizado (mão única, antigo → novo) e passar as leituras que combinam várias fontes (formulários, Crédito, vínculos de documento, bot) a ler só dele — sem nenhuma mudança de tela de cadastro para a equipe.

**Architecture:** Duas tabelas novas (`participacoes`, `pessoa_relacionamentos`) sem política de escrita para usuário (só service role/funções `SECURITY DEFINER`). Funções `pv2_sincronizar_*` idempotentes recalculam o conjunto de participantes de um lead/processo a partir das fontes antigas; o backfill é só "chamar a função para todos" e os triggers nas tabelas antigas chamam a mesma função. No TypeScript, um módulo `src/lib/participantes/` carrega e converte Participações para os formatos que formulários, Crédito e bot já usam.

**Tech Stack:** Supabase Postgres (migrations SQL rodadas manualmente pelo usuário no SQL Editor), Next.js 15 App Router, supabase-js, TanStack Query, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-09-28-participantes-v2-design.md`

## Global Constraints

- Implementação só depois do go-live de 01/10/2026; nunca push direto em `main` — branch + PR (memória `feedback_git_push_pr`).
- Migrations numeradas em sequência a partir de **324** (`supabase/migrations/2026MMDD_324_...`); se o número já estiver ocupado na hora da execução, usar o próximo livre e renomear todas as referências neste plano. Criadas em worktree → copiar `.sql` também para `supabase/migrations/` da raiz (CLAUDE.md).
- O usuário roda cada migration manualmente no Supabase SQL Editor; não existe homologação nem backup automático — todo script de teste SQL roda dentro de `BEGIN; ... ROLLBACK;`.
- Papéis: compra `titular | coparticipante | conjuge_anuente`; venda `vendedor | conjuge_vendedor`. Exatamente um `titular` por lead/processo.
- Participação **nunca** copia dado da Pessoa (nome/CPF/renda sempre de `pessoas`).
- Pessoa de usuário interno (telefone = `usuarios.telefone_whatsapp`/`telefone`, via `telefone_canonico_br`) **nunca** vira participante (CLAUDE.md, invariante 1).
- Toda query em `pessoas` filtra `deleted_at IS NULL`; toda consulta supabase-js olha `error`, não só `data` (CLAUDE.md).
- RLS nova usa `usuario_atual_pode(...)`/`usuario_atual_id()`, nunca lista fixa de perfis.
- Testes: `npx vitest run --exclude ".claude/**" --exclude "output/**" <arquivo>`; 4 falhas pré-existentes em `main` não são desta tarefa.
- Na Fase A, telas de cadastro continuam gravando no modelo antigo; ninguém grava direto em `participacoes`/`pessoa_relacionamentos` fora das funções `pv2_*`.

## Review Focus

- **Titular trocado** (lead.pessoa_id muda de A para B, A continua como coparticipante): a sincronização não pode violar o índice de titular único nem deixar dois titulares.
- **Mesma pessoa em duas listas antigas** (ex.: cônjuge também em `lead_coparticipantes`): vira **uma** Participação, com o papel de maior prioridade (titular > cônjuge > coparticipante > vendedor).
- **Merge de Pessoas** (`/api/pessoas/[id]/merge` faz UPDATE nas tabelas antigas e depois DELETE da duplicada): as Participações precisam acabar apontando para a Pessoa que ficou, sem erro de FK.
- **Cônjuge só em campos soltos com CPF que já é de outra Pessoa**: reaproveitar a Pessoa existente, nunca violar `pessoas_empresa_cpf_ativo_unique`.
- **Telefone/número no campo CPF** (11 dígitos inválidos): nunca gravar como CPF da Pessoa criada (regra `cpfValido`).

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/2026MMDD_324_participantes_v2_tabelas.sql` | Tabelas, índices, `cpf_valido`, `pessoa_e_de_operador`, triggers de integridade, RLS de leitura |
| `supabase/migrations/2026MMDD_325_participantes_v2_rls_pessoas.sql` | `pessoa_visivel_por_participacao` + policy SELECT de `pessoas` |
| `supabase/2026-MM-DD_diagnostico_participantes_v2.sql` | Diagnóstico só-leitura antes do backfill |
| `supabase/migrations/2026MMDD_326_participantes_v2_funcoes_sync.sql` | Funções `pv2_*` (sem efeito até serem chamadas) |
| `supabase/migrations/2026MMDD_327_participantes_v2_triggers_backfill.sql` | Triggers nas tabelas antigas + backfill, na mesma transação |
| `supabase/testes/participantes_v2_*.sql` | Testes SQL com ROLLBACK |
| `src/lib/participantes/tipos.ts` | Tipos e constantes de papel |
| `src/lib/participantes/carregar.ts` | `carregarParticipantes()` (servidor) |
| `src/lib/participantes/compradores.ts` | `montarCompradores()` / `montarVendedores()` (puro) |
| `src/lib/participantes/renda.ts` | `rendaComposta()` (puro) |
| `src/lib/participantes/vagas.ts` | `avisoVagasCompradores()` (puro) |
| `src/lib/participantes/leadDaPessoa.ts` | `leadMaisRecenteDaPessoa()` (bot) |
| `src/hooks/participantes/useParticipantes.ts` | Hook de leitura no navegador |
| Modificar: `src/lib/formularios/dados-lead.ts`, `src/lib/formularios/dados.ts`, `src/app/api/processos/[id]/formularios/route.ts`, `src/app/api/leads/[id]/formularios/route.ts`, `src/lib/documentos/vinculosServidor.ts`, `src/lib/documentos/destinosVinculo.ts`, `src/components/leads/LeadDetalhe/AbaCredito.tsx`, `src/lib/bot/fonti-comandos.ts`, `CLAUDE.md` | Leitores migrados |

---

### Task 1: Tabelas, integridade e RLS de leitura (migration 324)

**Files:**
- Create: `supabase/migrations/2026MMDD_324_participantes_v2_tabelas.sql`
- Test: `supabase/testes/participantes_v2_integridade.sql`

**Interfaces:**
- Produces: tabelas `participacoes(id, empresa_id, lead_id, processo_id, pessoa_id, papel, compoe_renda, ordem, criado_por, created_at, updated_at)` e `pessoa_relacionamentos(id, empresa_id, pessoa_a_id, pessoa_b_id, tipo, regime_bens, data_inicio, data_fim, created_at, updated_at)`; funções SQL `cpf_valido(text) → boolean`, `pessoa_e_de_operador(uuid) → boolean`.

- [ ] **Step 1: Escrever o teste SQL (vai falhar: tabelas não existem)**

`supabase/testes/participantes_v2_integridade.sql`:

```sql
-- Rodar no SQL Editor. Tudo é desfeito no ROLLBACK. Qualquer RAISE EXCEPTION = teste falhou.
BEGIN;
DO $$
DECLARE
  v_emp uuid; v_fase uuid; v_origem lead_origem;
  v_p1 uuid; v_p2 uuid; v_p3 uuid; v_lead uuid; v_ok boolean;
BEGIN
  SELECT id INTO v_emp FROM empresas LIMIT 1;
  SELECT id INTO v_fase FROM fases WHERE empresa_id = v_emp LIMIT 1;
  SELECT origem INTO v_origem FROM leads LIMIT 1;
  INSERT INTO pessoas (empresa_id, nome) VALUES (v_emp, 'PV2 TESTE A') RETURNING id INTO v_p1;
  INSERT INTO pessoas (empresa_id, nome) VALUES (v_emp, 'PV2 TESTE B') RETURNING id INTO v_p2;
  INSERT INTO pessoas (empresa_id, nome) VALUES (v_emp, 'PV2 TESTE C') RETURNING id INTO v_p3;
  INSERT INTO leads (empresa_id, nome, telefone, fase_id, origem)
    VALUES (v_emp, 'PV2 LEAD', '5544900000000', v_fase, v_origem) RETURNING id INTO v_lead;

  -- cpf_valido
  IF NOT cpf_valido('529.982.247-25') THEN RAISE EXCEPTION 'cpf válido recusado'; END IF;
  IF cpf_valido('44984558945') THEN RAISE EXCEPTION 'telefone aceito como CPF'; END IF;
  IF cpf_valido('11111111111') THEN RAISE EXCEPTION 'CPF repetido aceito'; END IF;

  -- titular único por lead
  INSERT INTO participacoes (empresa_id, lead_id, pessoa_id, papel, compoe_renda, ordem) VALUES (v_emp, v_lead, v_p1, 'titular', true, 1);
  BEGIN
    INSERT INTO participacoes (empresa_id, lead_id, pessoa_id, papel, compoe_renda, ordem) VALUES (v_emp, v_lead, v_p2, 'titular', true, 1);
    RAISE EXCEPTION 'dois titulares aceitos';
  EXCEPTION WHEN unique_violation THEN NULL; END;

  -- mesma pessoa duas vezes no mesmo lead
  BEGIN
    INSERT INTO participacoes (empresa_id, lead_id, pessoa_id, papel, compoe_renda, ordem) VALUES (v_emp, v_lead, v_p1, 'coparticipante', true, 2);
    RAISE EXCEPTION 'pessoa duplicada aceita';
  EXCEPTION WHEN unique_violation THEN NULL; END;

  -- lead e processo ao mesmo tempo / nenhum dos dois
  BEGIN
    INSERT INTO participacoes (empresa_id, pessoa_id, papel, compoe_renda, ordem) VALUES (v_emp, v_p2, 'coparticipante', true, 2);
    RAISE EXCEPTION 'participação sem alvo aceita';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- papel inválido
  BEGIN
    INSERT INTO participacoes (empresa_id, lead_id, pessoa_id, papel, compoe_renda, ordem) VALUES (v_emp, v_lead, v_p2, 'fiador', true, 2);
    RAISE EXCEPTION 'papel inválido aceito';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- relacionamento: par ordenado e um vigente por pessoa
  INSERT INTO pessoa_relacionamentos (empresa_id, pessoa_a_id, pessoa_b_id, tipo)
    VALUES (v_emp, least(v_p1, v_p2), greatest(v_p1, v_p2), 'casamento');
  BEGIN
    INSERT INTO pessoa_relacionamentos (empresa_id, pessoa_a_id, pessoa_b_id, tipo)
      VALUES (v_emp, least(v_p1, v_p3), greatest(v_p1, v_p3), 'casamento');
    RAISE EXCEPTION 'segundo casamento vigente aceito';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN
    INSERT INTO pessoa_relacionamentos (empresa_id, pessoa_a_id, pessoa_b_id, tipo)
      VALUES (v_emp, greatest(v_p2, v_p3), least(v_p2, v_p3), 'casamento');
    RAISE EXCEPTION 'par fora de ordem aceito';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- guard de operador: pessoa com telefone de usuário interno ativo
  SELECT EXISTS (SELECT 1 FROM usuarios WHERE empresa_id = v_emp AND ativo AND coalesce(telefone_whatsapp, telefone) IS NOT NULL) INTO v_ok;
  IF v_ok THEN
    INSERT INTO pessoa_telefones (pessoa_id, empresa_id, telefone)
      SELECT v_p3, v_emp, coalesce(telefone_whatsapp, telefone) FROM usuarios
      WHERE empresa_id = v_emp AND ativo AND coalesce(telefone_whatsapp, telefone) IS NOT NULL LIMIT 1;
    IF NOT pessoa_e_de_operador(v_p3) THEN RAISE EXCEPTION 'operador não detectado'; END IF;
    BEGIN
      INSERT INTO participacoes (empresa_id, lead_id, pessoa_id, papel, compoe_renda, ordem) VALUES (v_emp, v_lead, v_p3, 'coparticipante', true, 3);
      RAISE EXCEPTION 'pessoa de operador aceita como participante';
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM <> 'pessoa_de_operador' THEN RAISE; END IF;
    END;
  END IF;
  IF pessoa_e_de_operador(v_p1) THEN RAISE EXCEPTION 'pessoa comum marcada como operador'; END IF;

  RAISE NOTICE 'OK: integridade participantes v2';
END $$;
ROLLBACK;
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Pedir ao usuário para colar o arquivo no SQL Editor. Esperado: `ERROR: function cpf_valido(unknown) does not exist` (ou `relation "participacoes" does not exist`).

- [ ] **Step 3: Escrever a migration**

`supabase/migrations/2026MMDD_324_participantes_v2_tabelas.sql`:

```sql
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
```

- [ ] **Step 4: Rodar a migration e o teste**

Usuário cola a migration no SQL Editor → `Success`. Depois cola `supabase/testes/participantes_v2_integridade.sql`. Esperado: `NOTICE: OK: integridade participantes v2`, sem ERROR.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/2026MMDD_324_participantes_v2_tabelas.sql supabase/testes/participantes_v2_integridade.sql
git commit -m "feat(participantes): tabelas participacoes e pessoa_relacionamentos (V2 fase A)"
```

---

### Task 2: Pessoa visível por participação (migration 325)

**Files:**
- Create: `supabase/migrations/2026MMDD_325_participantes_v2_rls_pessoas.sql`
- Test: `supabase/testes/participantes_v2_rls_pessoas.sql`

**Interfaces:**
- Consumes: `participacoes`, `pessoa_relacionamentos` (Task 1).
- Produces: função `pessoa_visivel_por_participacao(uuid) → boolean`; policy `pessoas_empresa_select` redefinida.

- [ ] **Step 1: Escrever o teste SQL**

`supabase/testes/participantes_v2_rls_pessoas.sql` — simula um comercial via JWT. Antes de rodar, o usuário executa `SELECT auth_user_id, nome FROM usuarios WHERE perfil = 'comercial' AND ativo LIMIT 5;` e troca o valor de `v_auth` pela coluna `auth_user_id` de um comercial real:

```sql
BEGIN;
DO $$
DECLARE
  v_auth uuid := '00000000-0000-0000-0000-000000000000'; -- ← auth_user_id de um comercial ativo
  v_usr uuid; v_emp uuid; v_fase uuid; v_origem lead_origem;
  v_tit uuid; v_cop uuid; v_esposa uuid; v_estranho uuid; v_lead uuid; n int;
BEGIN
  SELECT id, empresa_id INTO v_usr, v_emp FROM usuarios WHERE auth_user_id = v_auth;
  IF v_usr IS NULL THEN RAISE EXCEPTION 'troque v_auth por um auth_user_id real'; END IF;
  SELECT id INTO v_fase FROM fases WHERE empresa_id = v_emp LIMIT 1;
  SELECT origem INTO v_origem FROM leads LIMIT 1;
  INSERT INTO pessoas (empresa_id, nome) VALUES (v_emp, 'PV2 TIT') RETURNING id INTO v_tit;
  INSERT INTO pessoas (empresa_id, nome) VALUES (v_emp, 'PV2 COP') RETURNING id INTO v_cop;
  INSERT INTO pessoas (empresa_id, nome) VALUES (v_emp, 'PV2 ESPOSA') RETURNING id INTO v_esposa;
  INSERT INTO pessoas (empresa_id, nome) VALUES (v_emp, 'PV2 ESTRANHO') RETURNING id INTO v_estranho;
  INSERT INTO leads (empresa_id, nome, telefone, fase_id, origem, responsavel_id, pessoa_id)
    VALUES (v_emp, 'PV2 LEAD', '5544900000001', v_fase, v_origem, v_usr, v_tit) RETURNING id INTO v_lead;
  INSERT INTO participacoes (empresa_id, lead_id, pessoa_id, papel, compoe_renda, ordem)
    VALUES (v_emp, v_lead, v_tit, 'titular', true, 1), (v_emp, v_lead, v_cop, 'coparticipante', true, 2);
  INSERT INTO pessoa_relacionamentos (empresa_id, pessoa_a_id, pessoa_b_id, tipo)
    VALUES (v_emp, least(v_cop, v_esposa), greatest(v_cop, v_esposa), 'casamento');

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  IF usuario_atual_pode('leads.ver_todas') THEN
    RAISE NOTICE 'comercial escolhido tem leads.ver_todas — teste inconclusivo, escolha outro'; RETURN;
  END IF;
  SELECT count(*) INTO n FROM pessoas WHERE id IN (v_cop, v_esposa);
  IF n <> 2 THEN RAISE EXCEPTION 'coparticipante/cônjuge dele invisíveis (viu %)', n; END IF;
  SELECT count(*) INTO n FROM pessoas WHERE id = v_estranho;
  IF n <> 0 THEN RAISE EXCEPTION 'pessoa sem vínculo ficou visível'; END IF;
  SELECT count(*) INTO n FROM participacoes WHERE lead_id = v_lead;
  IF n <> 2 THEN RAISE EXCEPTION 'participações do lead dele invisíveis (viu %)', n; END IF;
  RAISE NOTICE 'OK: RLS pessoas por participação';
END $$;
ROLLBACK;
```

- [ ] **Step 2: Rodar e ver falhar**

Esperado: `ERROR: coparticipante/cônjuge dele invisíveis (viu 0)`.

- [ ] **Step 3: Escrever a migration**

```sql
-- ============================================================
-- Migration 325: Pessoa visível por participação (spec participantes V2)
-- Comercial vê a Pessoa que participa de um lead/processo da carteira dele
-- (inclusive quando ela é cliente de outro comercial) e o cônjuge dessa Pessoa.
-- SECURITY DEFINER: evita recursão pessoas → pessoa_relacionamentos → pessoas.
-- ============================================================

CREATE OR REPLACE FUNCTION pessoa_visivel_por_participacao(p_pessoa_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM participacoes pa
    LEFT JOIN leads l      ON l.id  = pa.lead_id
    LEFT JOIN processos pr ON pr.id = pa.processo_id
    WHERE pa.pessoa_id IN (
        SELECT p_pessoa_id
        UNION ALL
        SELECT CASE WHEN r.pessoa_a_id = p_pessoa_id THEN r.pessoa_b_id ELSE r.pessoa_a_id END
        FROM pessoa_relacionamentos r
        WHERE r.data_fim IS NULL AND p_pessoa_id IN (r.pessoa_a_id, r.pessoa_b_id)
      )
      AND (
        (l.id IS NOT NULL AND l.deleted_at IS NULL AND l.responsavel_id = usuario_atual_id())
        OR (pr.id IS NOT NULL AND pr.deleted_at IS NULL
            AND (pr.comercial_id = usuario_atual_id() OR pr.operacional_id = usuario_atual_id()))
      )
  );
$$;

-- Mesma policy da migration 320 + a nova condição.
DROP POLICY IF EXISTS "pessoas_empresa_select" ON pessoas;
CREATE POLICY "pessoas_empresa_select" ON pessoas FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM usuarios u
    WHERE u.auth_user_id = auth.uid() AND u.ativo = true
      AND u.empresa_id = pessoas.empresa_id
      AND usuario_atual_pode('pessoas.ver')
  )
  AND (
    usuario_atual_pode('leads.ver_todas')
    OR EXISTS (
      SELECT 1 FROM leads l
      WHERE l.pessoa_id = pessoas.id
        AND l.deleted_at IS NULL
        AND l.responsavel_id = usuario_atual_id()
    )
    OR pessoa_visivel_por_participacao(pessoas.id)
  )
);
```

- [ ] **Step 4: Rodar migration e teste**

Esperado: `NOTICE: OK: RLS pessoas por participação`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/2026MMDD_325_participantes_v2_rls_pessoas.sql supabase/testes/participantes_v2_rls_pessoas.sql
git commit -m "feat(participantes): comercial enxerga pessoa que participa da proposta dele"
```

---

### Task 3: Funções de sincronização (migration 326)

**Files:**
- Create: `supabase/migrations/2026MMDD_326_participantes_v2_funcoes_sync.sql`
- Test: `supabase/testes/participantes_v2_sync.sql`

**Interfaces:**
- Consumes: Task 1.
- Produces (todas `SECURITY DEFINER`, idempotentes):
  - `pv2_pessoa_de_campos_soltos(p_empresa_id uuid, p_nome text, p_cpf text, p_nascimento date, p_profissao text, p_renda_formal numeric, p_renda_informal numeric) → uuid`
  - `pv2_garantir_relacionamento(p_empresa_id uuid, p1 uuid, p2 uuid, p_tipo text, p_regime text, p_data date) → void`
  - `pv2_sincronizar_relacionamento_pessoa(p_pessoa_id uuid) → void`
  - `pv2_sincronizar_lead(p_lead_id uuid) → void`
  - `pv2_sincronizar_processo(p_processo_id uuid) → void`
  - `pv2_gravar_participacoes(p_lead_id uuid, p_processo_id uuid, p_empresa_id uuid, p_pessoas uuid[], p_papeis text[], p_renda boolean[], p_ordens int[]) → void`

- [ ] **Step 1: Escrever o teste SQL**

`supabase/testes/participantes_v2_sync.sql`:

```sql
BEGIN;
DO $$
DECLARE
  v_emp uuid; v_fase uuid; v_origem lead_origem; v_modal modalidade_processo;
  v_heitor uuid; v_afranio uuid; v_lead uuid; v_proc uuid; v_maria uuid; v_x uuid; n int; r record;
BEGIN
  SELECT id INTO v_emp FROM empresas LIMIT 1;
  SELECT id INTO v_fase FROM fases WHERE empresa_id = v_emp LIMIT 1;
  SELECT origem INTO v_origem FROM leads LIMIT 1;
  SELECT modalidade INTO v_modal FROM processos LIMIT 1;

  -- Cenário real: Heitor (titular) + Afrânio (coparticipante, casado com Maria só em campos soltos)
  INSERT INTO pessoas (empresa_id, nome, estado_civil) VALUES (v_emp, 'PV2 HEITOR', 'solteiro') RETURNING id INTO v_heitor;
  INSERT INTO pessoas (empresa_id, nome, estado_civil, regime_casamento, data_casamento, conjuge_nome, conjuge_cpf)
    VALUES (v_emp, 'PV2 AFRANIO', 'casado', 'comunhao_parcial', '1990-05-01', 'PV2 MARIA', '44984558945') -- CPF inválido (telefone)
    RETURNING id INTO v_afranio;
  INSERT INTO leads (empresa_id, nome, telefone, fase_id, origem, pessoa_id, renda_formal)
    VALUES (v_emp, 'PV2 HEITOR', '5544900000002', v_fase, v_origem, v_heitor, 5000) RETURNING id INTO v_lead;
  INSERT INTO lead_coparticipantes (empresa_id, lead_id, pessoa_id) VALUES (v_emp, v_lead, v_afranio);

  PERFORM pv2_sincronizar_relacionamento_pessoa(v_afranio);
  SELECT conjuge_pessoa_id INTO v_maria FROM pessoas WHERE id = v_afranio;
  IF v_maria IS NULL THEN RAISE EXCEPTION 'cônjuge solto não virou Pessoa'; END IF;
  IF (SELECT cpf FROM pessoas WHERE id = v_maria) IS NOT NULL THEN RAISE EXCEPTION 'telefone gravado como CPF'; END IF;
  SELECT * INTO r FROM pessoa_relacionamentos WHERE data_fim IS NULL AND v_afranio IN (pessoa_a_id, pessoa_b_id);
  IF r.regime_bens <> 'comunhao_parcial' OR r.data_inicio <> '1990-05-01' OR r.tipo <> 'casamento' THEN
    RAISE EXCEPTION 'relacionamento sem regime/data/tipo: %', row_to_json(r);
  END IF;

  PERFORM pv2_sincronizar_lead(v_lead);
  PERFORM pv2_sincronizar_lead(v_lead); -- idempotente
  SELECT count(*) INTO n FROM participacoes WHERE lead_id = v_lead;
  IF n <> 2 THEN RAISE EXCEPTION 'esperava 2 participações, veio %', n; END IF;
  IF NOT EXISTS (SELECT 1 FROM participacoes WHERE lead_id = v_lead AND pessoa_id = v_heitor AND papel = 'titular' AND compoe_renda) THEN RAISE EXCEPTION 'titular errado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM participacoes WHERE lead_id = v_lead AND pessoa_id = v_afranio AND papel = 'coparticipante' AND compoe_renda) THEN RAISE EXCEPTION 'coparticipante errado'; END IF;
  IF (SELECT renda_formal FROM pessoas WHERE id = v_heitor) IS NOT NULL THEN
    RAISE NOTICE 'renda do titular já existia na pessoa (ok)';
  END IF;

  -- Titular trocado: Afrânio vira titular, Heitor sai de coparticipante? Não: Heitor some da fonte antiga.
  UPDATE leads SET pessoa_id = v_afranio WHERE id = v_lead;
  DELETE FROM lead_coparticipantes WHERE lead_id = v_lead;
  INSERT INTO lead_coparticipantes (empresa_id, lead_id, pessoa_id) VALUES (v_emp, v_lead, v_heitor);
  PERFORM pv2_sincronizar_lead(v_lead);
  IF NOT EXISTS (SELECT 1 FROM participacoes WHERE lead_id = v_lead AND pessoa_id = v_afranio AND papel = 'titular') THEN RAISE EXCEPTION 'troca de titular falhou'; END IF;
  IF NOT EXISTS (SELECT 1 FROM participacoes WHERE lead_id = v_lead AND pessoa_id = v_heitor AND papel = 'coparticipante') THEN RAISE EXCEPTION 'ex-titular não virou coparticipante'; END IF;
  -- Maria entra como cônjuge anuente do titular (vem de pessoas.conjuge_pessoa_id do Afrânio)
  IF NOT EXISTS (SELECT 1 FROM participacoes WHERE lead_id = v_lead AND pessoa_id = v_maria AND papel = 'conjuge_anuente' AND NOT compoe_renda) THEN RAISE EXCEPTION 'cônjuge do titular faltando'; END IF;

  -- Mesma pessoa em duas listas: Maria também como coparticipante → uma linha só, papel cônjuge
  INSERT INTO lead_coparticipantes (empresa_id, lead_id, pessoa_id) VALUES (v_emp, v_lead, v_maria);
  PERFORM pv2_sincronizar_lead(v_lead);
  SELECT count(*) INTO n FROM participacoes WHERE lead_id = v_lead AND pessoa_id = v_maria;
  IF n <> 1 THEN RAISE EXCEPTION 'pessoa duplicada'; END IF;

  -- Processo: comprador sem pessoa_id com CPF de pessoa existente → reaproveita
  UPDATE pessoas SET cpf = '529.982.247-25' WHERE id = v_heitor;
  INSERT INTO processos (empresa_id, numero_processo, nome_imovel, modalidade, lead_id)
    VALUES (v_emp, 'PV2-TESTE', 'PV2 IMOVEL', v_modal, v_lead) RETURNING id INTO v_proc;
  INSERT INTO processo_compradores (empresa_id, processo_id, nome, principal, pessoa_id) VALUES (v_emp, v_proc, 'PV2 AFRANIO', true, v_afranio);
  INSERT INTO processo_compradores (empresa_id, processo_id, nome, cpf, principal) VALUES (v_emp, v_proc, 'Heitor digitado', '52998224725', false);
  INSERT INTO processo_compradores (empresa_id, processo_id, nome, principal, pessoa_id) VALUES (v_emp, v_proc, 'PV2 MARIA', false, v_maria);
  INSERT INTO processo_vendedores (empresa_id, processo_id, nome, cpf, conjuge_nome, conjuge_papel, banco)
    VALUES (v_emp, v_proc, 'PV2 VENDEDOR', NULL, 'PV2 VENDEDORA', 'proprietario', '001');
  PERFORM pv2_sincronizar_processo(v_proc);
  IF (SELECT pessoa_id FROM processo_compradores WHERE processo_id = v_proc AND nome = 'Heitor digitado') <> v_heitor THEN RAISE EXCEPTION 'CPF existente não reaproveitado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM participacoes WHERE processo_id = v_proc AND pessoa_id = v_afranio AND papel = 'titular') THEN RAISE EXCEPTION 'titular do processo'; END IF;
  IF NOT EXISTS (SELECT 1 FROM participacoes WHERE processo_id = v_proc AND pessoa_id = v_maria AND papel = 'conjuge_anuente') THEN RAISE EXCEPTION 'cônjuge do processo'; END IF;
  IF NOT EXISTS (SELECT 1 FROM participacoes WHERE processo_id = v_proc AND pessoa_id = v_heitor AND papel = 'coparticipante') THEN RAISE EXCEPTION 'coparticipante do processo'; END IF;
  SELECT count(*) INTO n FROM participacoes WHERE processo_id = v_proc AND papel = 'vendedor';
  IF n <> 2 THEN RAISE EXCEPTION 'vendedor + cônjuge proprietária deviam ser 2 vendedores, veio %', n; END IF;
  SELECT pessoa_id INTO v_x FROM processo_vendedores WHERE processo_id = v_proc;
  IF (SELECT conta_bancaria_banco FROM pessoas WHERE id = v_x) <> '001' THEN RAISE EXCEPTION 'banco do vendedor não foi pra Pessoa'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pessoa_relacionamentos WHERE data_fim IS NULL AND v_x IN (pessoa_a_id, pessoa_b_id)) THEN RAISE EXCEPTION 'casal vendedor sem relacionamento'; END IF;

  RAISE NOTICE 'OK: sync participantes v2';
END $$;
ROLLBACK;
```

- [ ] **Step 2: Rodar e ver falhar**

Esperado: `ERROR: function pv2_sincronizar_relacionamento_pessoa(uuid) does not exist`.

- [ ] **Step 3: Escrever a migration**

```sql
-- ============================================================
-- Migration 326: Participantes V2 — funções de sincronização (mão única: antigo → novo)
-- Idempotentes. Usadas pelo backfill e pelos triggers (migration 327).
-- Única escrita nas tabelas antigas: preencher pessoa_id/conjuge_pessoa_id que estavam
-- vazios com a Pessoa criada a partir de campos soltos (converge o modelo antigo).
-- ============================================================

CREATE OR REPLACE FUNCTION pv2_pessoa_de_campos_soltos(
  p_empresa_id uuid, p_nome text, p_cpf text, p_nascimento date, p_profissao text,
  p_renda_formal numeric, p_renda_informal numeric
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cpf text; v_id uuid;
BEGIN
  v_cpf := CASE WHEN cpf_valido(p_cpf) THEN regexp_replace(p_cpf, '\D', '', 'g') END;
  IF coalesce(trim(p_nome), '') = '' AND v_cpf IS NULL THEN RETURN NULL; END IF;
  IF v_cpf IS NOT NULL THEN
    SELECT id INTO v_id FROM pessoas
    WHERE empresa_id = p_empresa_id AND deleted_at IS NULL
      AND regexp_replace(coalesce(cpf, ''), '\D', '', 'g') = v_cpf
    LIMIT 1;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;
  INSERT INTO pessoas (empresa_id, nome, cpf, data_nascimento, profissao, renda_formal, renda_informal)
  VALUES (p_empresa_id, coalesce(nullif(trim(p_nome), ''), 'Cônjuge sem nome'), v_cpf, p_nascimento, p_profissao, p_renda_formal, p_renda_informal)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION pv2_garantir_relacionamento(
  p_empresa_id uuid, p1 uuid, p2 uuid, p_tipo text, p_regime text, p_data date
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_a uuid := least(p1, p2); v_b uuid := greatest(p1, p2); v_id uuid;
BEGIN
  IF p1 IS NULL OR p2 IS NULL OR p1 = p2 THEN RETURN; END IF;
  SELECT id INTO v_id FROM pessoa_relacionamentos
  WHERE pessoa_a_id = v_a AND pessoa_b_id = v_b AND data_fim IS NULL;
  IF v_id IS NOT NULL THEN
    UPDATE pessoa_relacionamentos
    SET regime_bens = coalesce(p_regime, regime_bens),
        data_inicio = coalesce(p_data, data_inicio),
        tipo        = coalesce(p_tipo, tipo)
    WHERE id = v_id
      AND (regime_bens IS DISTINCT FROM coalesce(p_regime, regime_bens)
        OR data_inicio IS DISTINCT FROM coalesce(p_data, data_inicio)
        OR tipo IS DISTINCT FROM coalesce(p_tipo, tipo));
    RETURN;
  END IF;
  -- Uma das duas já tem outro casamento vigente: não decide sozinho (aparece no diagnóstico).
  IF EXISTS (SELECT 1 FROM pessoa_relacionamentos
             WHERE data_fim IS NULL AND (pessoa_a_id IN (v_a, v_b) OR pessoa_b_id IN (v_a, v_b))) THEN
    RETURN;
  END IF;
  INSERT INTO pessoa_relacionamentos (empresa_id, pessoa_a_id, pessoa_b_id, tipo, regime_bens, data_inicio)
  VALUES (p_empresa_id, v_a, v_b, coalesce(p_tipo, 'casamento'), p_regime, p_data);
END $$;

CREATE OR REPLACE FUNCTION pv2_sincronizar_relacionamento_pessoa(p_pessoa_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p pessoas%ROWTYPE; v_conj uuid;
BEGIN
  SELECT * INTO p FROM pessoas WHERE id = p_pessoa_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RETURN; END IF;
  v_conj := p.conjuge_pessoa_id;
  IF v_conj IS NULL AND p.estado_civil IN ('casado', 'uniao_estavel')
     AND (coalesce(trim(p.conjuge_nome), '') <> '' OR p.conjuge_cpf IS NOT NULL) THEN
    v_conj := pv2_pessoa_de_campos_soltos(p.empresa_id, p.conjuge_nome, p.conjuge_cpf, p.conjuge_data_nascimento,
                                          p.conjuge_profissao, p.conjuge_renda_formal, p.conjuge_renda_informal);
    IF v_conj IS NOT NULL AND v_conj <> p.id THEN
      UPDATE pessoas SET conjuge_pessoa_id = v_conj WHERE id = p.id;
    END IF;
  END IF;
  IF v_conj IS NOT NULL AND v_conj <> p.id AND p.estado_civil IN ('casado', 'uniao_estavel') THEN
    PERFORM pv2_garantir_relacionamento(p.empresa_id, p.id, v_conj,
      CASE WHEN p.estado_civil = 'uniao_estavel' THEN 'uniao_estavel' ELSE 'casamento' END,
      p.regime_casamento, p.data_casamento);
  END IF;
END $$;

-- Grava o conjunto desejado de um lead OU processo. Arrays em ordem de prioridade:
-- se a mesma pessoa aparecer duas vezes, vale a primeira ocorrência.
CREATE OR REPLACE FUNCTION pv2_gravar_participacoes(
  p_lead_id uuid, p_processo_id uuid, p_empresa_id uuid,
  p_pessoas uuid[], p_papeis text[], p_renda boolean[], p_ordens int[]
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_titular uuid;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS pv2_desejadas (pessoa_id uuid, papel text, compoe_renda boolean, ordem int) ON COMMIT DROP;
  TRUNCATE pv2_desejadas;
  INSERT INTO pv2_desejadas
  SELECT DISTINCT ON (x.pessoa_id) x.pessoa_id, x.papel, x.renda, x.ordem
  FROM unnest(p_pessoas, p_papeis, p_renda, p_ordens) WITH ORDINALITY AS x(pessoa_id, papel, renda, ordem, prioridade)
  WHERE x.pessoa_id IS NOT NULL AND NOT pessoa_e_de_operador(x.pessoa_id)
  ORDER BY x.pessoa_id, x.prioridade;

  SELECT pessoa_id INTO v_titular FROM pv2_desejadas WHERE papel = 'titular';

  DELETE FROM participacoes pa
  WHERE ((p_lead_id IS NOT NULL AND pa.lead_id = p_lead_id) OR (p_processo_id IS NOT NULL AND pa.processo_id = p_processo_id))
    AND NOT EXISTS (SELECT 1 FROM pv2_desejadas d WHERE d.pessoa_id = pa.pessoa_id);

  -- Rebaixa o titular antigo antes de promover o novo (índice de titular único).
  UPDATE participacoes pa SET papel = 'coparticipante'
  WHERE ((p_lead_id IS NOT NULL AND pa.lead_id = p_lead_id) OR (p_processo_id IS NOT NULL AND pa.processo_id = p_processo_id))
    AND pa.papel = 'titular' AND pa.pessoa_id IS DISTINCT FROM v_titular;

  IF p_lead_id IS NOT NULL THEN
    INSERT INTO participacoes (empresa_id, lead_id, pessoa_id, papel, compoe_renda, ordem)
    SELECT p_empresa_id, p_lead_id, d.pessoa_id, d.papel, d.compoe_renda, d.ordem FROM pv2_desejadas d
    ON CONFLICT (lead_id, pessoa_id) WHERE lead_id IS NOT NULL
    DO UPDATE SET papel = EXCLUDED.papel, compoe_renda = EXCLUDED.compoe_renda, ordem = EXCLUDED.ordem
    WHERE (participacoes.papel, participacoes.compoe_renda, participacoes.ordem)
          IS DISTINCT FROM (EXCLUDED.papel, EXCLUDED.compoe_renda, EXCLUDED.ordem);
  ELSE
    INSERT INTO participacoes (empresa_id, processo_id, pessoa_id, papel, compoe_renda, ordem)
    SELECT p_empresa_id, p_processo_id, d.pessoa_id, d.papel, d.compoe_renda, d.ordem FROM pv2_desejadas d
    ON CONFLICT (processo_id, pessoa_id) WHERE processo_id IS NOT NULL
    DO UPDATE SET papel = EXCLUDED.papel, compoe_renda = EXCLUDED.compoe_renda, ordem = EXCLUDED.ordem
    WHERE (participacoes.papel, participacoes.compoe_renda, participacoes.ordem)
          IS DISTINCT FROM (EXCLUDED.papel, EXCLUDED.compoe_renda, EXCLUDED.ordem);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION pv2_tem_renda(p_pessoa_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(renda_formal, 0) + coalesce(renda_informal, 0) > 0 FROM pessoas WHERE id = p_pessoa_id;
$$;

CREATE OR REPLACE FUNCTION pv2_sincronizar_lead(p_lead_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  l leads%ROWTYPE; v_conj uuid; v_estado text;
  v_pessoas uuid[] := '{}'; v_papeis text[] := '{}'; v_renda boolean[] := '{}'; v_ordens int[] := '{}';
  r record; i int;
BEGIN
  SELECT * INTO l FROM leads WHERE id = p_lead_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- Cônjuge: Pessoa do titular → Pessoa do lead → campos soltos do lead (vira Pessoa).
  -- Estado civil da Pessoa manda: divorciado/viúvo/solteiro = sem cônjuge, mesmo que
  -- leads.conjuge_pessoa_id ainda aponte pro ex (senão a sync "recasaria" a pessoa).
  IF l.pessoa_id IS NOT NULL THEN
    PERFORM pv2_sincronizar_relacionamento_pessoa(l.pessoa_id);
    SELECT conjuge_pessoa_id, estado_civil INTO v_conj, v_estado FROM pessoas WHERE id = l.pessoa_id;
  END IF;
  v_estado := coalesce(v_estado, l.estado_civil);
  IF v_estado IN ('casado', 'uniao_estavel') THEN
    v_conj := coalesce(v_conj, l.conjuge_pessoa_id);
    IF v_conj IS NULL AND (coalesce(trim(l.conjuge_nome), '') <> '' OR l.conjuge_cpf IS NOT NULL) THEN
      v_conj := pv2_pessoa_de_campos_soltos(l.empresa_id, l.conjuge_nome, l.conjuge_cpf, l.conjuge_data_nascimento,
                                            NULL, l.conjuge_renda_formal, l.conjuge_renda_informal);
    END IF;
  ELSE
    v_conj := NULL;
  END IF;
  IF v_conj IS NOT NULL AND l.pessoa_id IS NOT NULL AND v_conj <> l.pessoa_id THEN
    UPDATE leads SET conjuge_pessoa_id = v_conj WHERE id = l.id AND conjuge_pessoa_id IS DISTINCT FROM v_conj;
    UPDATE pessoas SET conjuge_pessoa_id = v_conj WHERE id = l.pessoa_id AND conjuge_pessoa_id IS NULL;
    PERFORM pv2_sincronizar_relacionamento_pessoa(l.pessoa_id);
  END IF;

  -- Ordem de prioridade: titular, cônjuge, coparticipantes, vendedores
  IF l.pessoa_id IS NOT NULL THEN
    v_pessoas := v_pessoas || l.pessoa_id; v_papeis := v_papeis || 'titular'::text; v_renda := v_renda || true; v_ordens := v_ordens || 1;
  END IF;
  IF v_conj IS NOT NULL THEN
    v_pessoas := v_pessoas || v_conj; v_papeis := v_papeis || 'conjuge_anuente'::text;
    v_renda := v_renda || coalesce(pv2_tem_renda(v_conj), false); v_ordens := v_ordens || 2;
  END IF;
  i := 3;
  FOR r IN SELECT pessoa_id FROM lead_coparticipantes WHERE lead_id = l.id ORDER BY created_at LOOP
    v_pessoas := v_pessoas || r.pessoa_id; v_papeis := v_papeis || 'coparticipante'::text; v_renda := v_renda || true; v_ordens := v_ordens || i; i := i + 1;
  END LOOP;
  i := 1;
  FOR r IN SELECT pessoa_id FROM lead_vendedores WHERE lead_id = l.id ORDER BY created_at LOOP
    v_pessoas := v_pessoas || r.pessoa_id; v_papeis := v_papeis || 'vendedor'::text; v_renda := v_renda || false; v_ordens := v_ordens || i; i := i + 1;
  END LOOP;
  IF l.vendedor_pessoa_id IS NOT NULL THEN
    v_pessoas := v_pessoas || l.vendedor_pessoa_id; v_papeis := v_papeis || 'vendedor'::text; v_renda := v_renda || false; v_ordens := v_ordens || i;
  END IF;

  PERFORM pv2_gravar_participacoes(l.id, NULL, l.empresa_id, v_pessoas, v_papeis, v_renda, v_ordens);
END $$;

CREATE OR REPLACE FUNCTION pv2_sincronizar_processo(p_processo_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  pr processos%ROWTYPE; r record; v_pid uuid; v_conj uuid; v_titular uuid; i int;
  v_compradores uuid[] := '{}';
  v_pessoas uuid[] := '{}'; v_papeis text[] := '{}'; v_renda boolean[] := '{}'; v_ordens int[] := '{}';
BEGIN
  SELECT * INTO pr FROM processos WHERE id = p_processo_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- Compradores sem Pessoa ganham uma (por CPF ou nova) e o pessoa_id é gravado de volta.
  FOR r IN SELECT * FROM processo_compradores WHERE processo_id = pr.id AND pessoa_id IS NULL LOOP
    v_pid := pv2_pessoa_de_campos_soltos(pr.empresa_id, r.nome, r.cpf, NULL, NULL, r.renda_mensal, NULL);
    IF v_pid IS NOT NULL THEN UPDATE processo_compradores SET pessoa_id = v_pid WHERE id = r.id; END IF;
  END LOOP;

  -- Titular: principal; sem principal, o mais antigo.
  SELECT pessoa_id INTO v_titular FROM processo_compradores
  WHERE processo_id = pr.id AND pessoa_id IS NOT NULL ORDER BY principal DESC, created_at LIMIT 1;
  SELECT array_agg(pessoa_id) INTO v_compradores FROM processo_compradores WHERE processo_id = pr.id AND pessoa_id IS NOT NULL;

  IF v_titular IS NOT NULL THEN
    PERFORM pv2_sincronizar_relacionamento_pessoa(v_titular);
    v_pessoas := v_pessoas || v_titular; v_papeis := v_papeis || 'titular'::text; v_renda := v_renda || true; v_ordens := v_ordens || 1;
  END IF;
  i := 2;
  FOR r IN SELECT pessoa_id FROM processo_compradores
           WHERE processo_id = pr.id AND pessoa_id IS NOT NULL AND pessoa_id IS DISTINCT FROM v_titular
           ORDER BY created_at LOOP
    PERFORM pv2_sincronizar_relacionamento_pessoa(r.pessoa_id);
    -- Comprador casado com outro comprador do mesmo processo = cônjuge.
    IF EXISTS (SELECT 1 FROM pessoa_relacionamentos rel
               WHERE rel.data_fim IS NULL AND r.pessoa_id IN (rel.pessoa_a_id, rel.pessoa_b_id)
                 AND (CASE WHEN rel.pessoa_a_id = r.pessoa_id THEN rel.pessoa_b_id ELSE rel.pessoa_a_id END) = ANY(v_compradores)) THEN
      v_pessoas := v_pessoas || r.pessoa_id; v_papeis := v_papeis || 'conjuge_anuente'::text;
      v_renda := v_renda || coalesce(pv2_tem_renda(r.pessoa_id), false);
    ELSE
      v_pessoas := v_pessoas || r.pessoa_id; v_papeis := v_papeis || 'coparticipante'::text; v_renda := v_renda || true;
    END IF;
    v_ordens := v_ordens || i; i := i + 1;
  END LOOP;

  -- Vendedores (+ cônjuge em campos soltos: proprietário = vendedor, senão só assina)
  i := 1;
  FOR r IN SELECT * FROM processo_vendedores WHERE processo_id = pr.id ORDER BY created_at LOOP
    v_pid := r.pessoa_id;
    IF v_pid IS NULL THEN
      v_pid := pv2_pessoa_de_campos_soltos(pr.empresa_id, r.nome, r.cpf, NULL, NULL, NULL, NULL);
      IF v_pid IS NOT NULL THEN UPDATE processo_vendedores SET pessoa_id = v_pid WHERE id = r.id; END IF;
    END IF;
    IF v_pid IS NULL THEN CONTINUE; END IF;
    UPDATE pessoas SET conta_bancaria_banco = coalesce(conta_bancaria_banco, r.banco),
                       conta_bancaria_agencia = coalesce(conta_bancaria_agencia, r.agencia),
                       conta_bancaria_numero = coalesce(conta_bancaria_numero, r.conta)
    WHERE id = v_pid AND (conta_bancaria_banco IS NULL AND r.banco IS NOT NULL
                       OR conta_bancaria_agencia IS NULL AND r.agencia IS NOT NULL
                       OR conta_bancaria_numero IS NULL AND r.conta IS NOT NULL);
    v_pessoas := v_pessoas || v_pid; v_papeis := v_papeis || 'vendedor'::text; v_renda := v_renda || false; v_ordens := v_ordens || i; i := i + 1;
    IF coalesce(trim(r.conjuge_nome), '') <> '' OR r.conjuge_cpf IS NOT NULL THEN
      v_conj := pv2_pessoa_de_campos_soltos(pr.empresa_id, r.conjuge_nome, r.conjuge_cpf, r.conjuge_data_nasc, NULL, NULL, NULL);
      IF v_conj IS NOT NULL AND v_conj <> v_pid THEN
        PERFORM pv2_garantir_relacionamento(pr.empresa_id, v_pid, v_conj,
          CASE WHEN r.estado_civil = 'uniao_estavel' THEN 'uniao_estavel' ELSE 'casamento' END, NULL, NULL);
        v_pessoas := v_pessoas || v_conj;
        v_papeis := v_papeis || (CASE WHEN r.conjuge_papel = 'proprietario' THEN 'vendedor' ELSE 'conjuge_vendedor' END);
        v_renda := v_renda || false; v_ordens := v_ordens || i; i := i + 1;
      END IF;
    END IF;
  END LOOP;

  PERFORM pv2_gravar_participacoes(NULL, pr.id, pr.empresa_id, v_pessoas, v_papeis, v_renda, v_ordens);
END $$;
```

- [ ] **Step 4: Rodar migration e teste**

Esperado: `NOTICE: OK: sync participantes v2`. Se falhar, corrigir a função e repetir (o teste é todo desfeito no ROLLBACK).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/2026MMDD_326_participantes_v2_funcoes_sync.sql supabase/testes/participantes_v2_sync.sql
git commit -m "feat(participantes): funções idempotentes de sincronização antigo → novo"
```

---

### Task 4: Diagnóstico antes do backfill

**Files:**
- Create: `supabase/2026-MM-DD_diagnostico_participantes_v2.sql`

**Interfaces:**
- Consumes: `cpf_valido`, `pessoa_e_de_operador` (Task 1).

- [ ] **Step 1: Escrever o diagnóstico (só SELECT)**

```sql
-- Diagnóstico Participantes V2 — SÓ LEITURA. Rodar cada bloco e revisar com o usuário ANTES do backfill.

-- 1. Renda divergente entre lead e Pessoa titular (backfill: Pessoa vence; nula recebe do lead)
SELECT l.id AS lead_id, l.nome, l.renda_formal AS lead_formal, p.renda_formal AS pessoa_formal,
       l.renda_informal AS lead_informal, p.renda_informal AS pessoa_informal
FROM leads l JOIN pessoas p ON p.id = l.pessoa_id
WHERE l.deleted_at IS NULL
  AND ((l.renda_formal IS NOT NULL AND p.renda_formal IS NOT NULL AND l.renda_formal <> p.renda_formal)
    OR (l.renda_informal IS NOT NULL AND p.renda_informal IS NOT NULL AND l.renda_informal <> p.renda_informal));

-- 2. Cônjuge só em campos soltos (vai virar Pessoa). cpf_ok = false → CPF será descartado.
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
```

- [ ] **Step 2: Rodar com o usuário**

Rodar os 9 blocos no SQL Editor. Anotar as contagens no PR. Decidir com o usuário, caso a caso, os itens de (5) e (7) — corrigir manualmente antes da Task 5 quando ele pedir. Nada é gravado nesta task.

- [ ] **Step 3: Commit**

```bash
git add supabase/2026-MM-DD_diagnostico_participantes_v2.sql
git commit -m "chore(participantes): diagnóstico só-leitura antes do backfill V2"
```

---

### Task 5: Triggers de sincronização + backfill (migration 327)

**Files:**
- Create: `supabase/migrations/2026MMDD_327_participantes_v2_triggers_backfill.sql`
- Test: `supabase/testes/participantes_v2_triggers.sql`

**Interfaces:**
- Consumes: todas as funções `pv2_*` (Task 3).
- Produces: triggers `trg_pv2_*` em `leads`, `lead_coparticipantes`, `lead_vendedores`, `processo_compradores`, `processo_vendedores`, `pessoas`; tabelas novas preenchidas.

- [ ] **Step 1: Escrever o teste SQL dos triggers**

`supabase/testes/participantes_v2_triggers.sql`:

```sql
BEGIN;
DO $$
DECLARE
  v_emp uuid; v_fase uuid; v_origem lead_origem; v_modal modalidade_processo;
  v_a uuid; v_b uuid; v_c uuid; v_lead uuid; v_proc uuid; n int;
BEGIN
  SELECT id INTO v_emp FROM empresas LIMIT 1;
  SELECT id INTO v_fase FROM fases WHERE empresa_id = v_emp LIMIT 1;
  SELECT origem INTO v_origem FROM leads LIMIT 1;
  SELECT modalidade INTO v_modal FROM processos LIMIT 1;
  INSERT INTO pessoas (empresa_id, nome) VALUES (v_emp, 'PV2T A') RETURNING id INTO v_a;
  INSERT INTO pessoas (empresa_id, nome) VALUES (v_emp, 'PV2T B') RETURNING id INTO v_b;
  INSERT INTO pessoas (empresa_id, nome) VALUES (v_emp, 'PV2T C') RETURNING id INTO v_c;

  -- lead novo com titular → participação criada pelo trigger
  INSERT INTO leads (empresa_id, nome, telefone, fase_id, origem, pessoa_id)
    VALUES (v_emp, 'PV2T', '5544900000003', v_fase, v_origem, v_a) RETURNING id INTO v_lead;
  IF NOT EXISTS (SELECT 1 FROM participacoes WHERE lead_id = v_lead AND pessoa_id = v_a AND papel = 'titular') THEN RAISE EXCEPTION 'insert de lead não sincronizou'; END IF;

  -- coparticipante adicionado/removido pela tabela antiga
  INSERT INTO lead_coparticipantes (empresa_id, lead_id, pessoa_id) VALUES (v_emp, v_lead, v_b);
  IF NOT EXISTS (SELECT 1 FROM participacoes WHERE lead_id = v_lead AND pessoa_id = v_b) THEN RAISE EXCEPTION 'coparticipante não sincronizou'; END IF;
  DELETE FROM lead_coparticipantes WHERE lead_id = v_lead AND pessoa_id = v_b;
  IF EXISTS (SELECT 1 FROM participacoes WHERE lead_id = v_lead AND pessoa_id = v_b) THEN RAISE EXCEPTION 'remoção não sincronizou'; END IF;

  -- renda editada no lead (aba Crédito antiga) vai para a Pessoa
  UPDATE leads SET renda_formal = 7777 WHERE id = v_lead;
  IF (SELECT renda_formal FROM pessoas WHERE id = v_a) <> 7777 THEN RAISE EXCEPTION 'renda do lead não foi pra Pessoa'; END IF;

  -- casar A com C pela tela antiga (pessoas.conjuge_pessoa_id) → relacionamento + cônjuge no lead
  UPDATE pessoas SET estado_civil = 'casado', conjuge_pessoa_id = v_c, regime_casamento = 'separacao_total' WHERE id = v_a;
  IF NOT EXISTS (SELECT 1 FROM pessoa_relacionamentos WHERE data_fim IS NULL AND pessoa_a_id = least(v_a, v_c) AND pessoa_b_id = greatest(v_a, v_c) AND regime_bens = 'separacao_total') THEN RAISE EXCEPTION 'relacionamento não criado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM participacoes WHERE lead_id = v_lead AND pessoa_id = v_c AND papel = 'conjuge_anuente') THEN RAISE EXCEPTION 'cônjuge não entrou no lead'; END IF;

  -- renda do cônjuge editada no lead vai para a Pessoa do cônjuge
  UPDATE leads SET conjuge_renda_formal = 3000 WHERE id = v_lead;
  IF (SELECT renda_formal FROM pessoas WHERE id = v_c) <> 3000 THEN RAISE EXCEPTION 'renda do cônjuge não foi pra Pessoa'; END IF;

  -- divórcio pela tela antiga encerra o relacionamento (não apaga)
  UPDATE pessoas SET estado_civil = 'divorciado', conjuge_pessoa_id = NULL WHERE id = v_a;
  IF EXISTS (SELECT 1 FROM pessoa_relacionamentos WHERE data_fim IS NULL AND v_a IN (pessoa_a_id, pessoa_b_id)) THEN RAISE EXCEPTION 'relacionamento não encerrado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pessoa_relacionamentos WHERE data_fim IS NOT NULL AND v_a IN (pessoa_a_id, pessoa_b_id)) THEN RAISE EXCEPTION 'histórico apagado'; END IF;
  IF EXISTS (SELECT 1 FROM participacoes WHERE lead_id = v_lead AND pessoa_id = v_c) THEN RAISE EXCEPTION 'ex-cônjuge continuou no lead'; END IF;
  IF (SELECT conjuge_pessoa_id FROM pessoas WHERE id = v_a) IS NOT NULL THEN RAISE EXCEPTION 'sync recasou a pessoa'; END IF;

  -- processo: comprador pela tabela antiga
  INSERT INTO processos (empresa_id, numero_processo, nome_imovel, modalidade) VALUES (v_emp, 'PV2T-1', 'PV2T', v_modal) RETURNING id INTO v_proc;
  INSERT INTO processo_compradores (empresa_id, processo_id, nome, principal, pessoa_id) VALUES (v_emp, v_proc, 'PV2T A', true, v_a);
  IF NOT EXISTS (SELECT 1 FROM participacoes WHERE processo_id = v_proc AND pessoa_id = v_a AND papel = 'titular') THEN RAISE EXCEPTION 'comprador não sincronizou'; END IF;

  -- merge de Pessoas: tabela antiga passa pra B, A é apagada → participação segue em B
  UPDATE processo_compradores SET pessoa_id = v_b WHERE processo_id = v_proc;
  UPDATE leads SET pessoa_id = v_b WHERE id = v_lead;
  DELETE FROM pessoas WHERE id = v_a;
  SELECT count(*) INTO n FROM participacoes WHERE (processo_id = v_proc OR lead_id = v_lead) AND pessoa_id = v_b AND papel = 'titular';
  IF n <> 2 THEN RAISE EXCEPTION 'merge: titular não passou para B (%)', n; END IF;

  RAISE NOTICE 'OK: triggers participantes v2';
END $$;
ROLLBACK;
```

- [ ] **Step 2: Rodar e ver falhar**

Esperado: `ERROR: insert de lead não sincronizou`.

- [ ] **Step 3: Escrever a migration (triggers + backfill na mesma transação)**

```sql
-- ============================================================
-- Migration 327: Participantes V2 — triggers de sincronização + backfill
-- Rodar SÓ depois de revisar o diagnóstico (supabase/*_diagnostico_participantes_v2.sql).
-- Triggers e backfill na mesma transação: nenhuma escrita escapa entre um e outro.
-- pg_trigger_depth() > 1: ignora UPDATEs feitos pelas próprias funções pv2_* e por
-- outros triggers (ex.: fn_sincronizar_pessoa_conjuge), evitando laço.
-- ============================================================
BEGIN;

CREATE OR REPLACE FUNCTION fn_pv2_leads() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_conj uuid;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NULL; END IF;
  IF TG_OP = 'UPDATE' AND NEW.pessoa_id IS NOT NULL THEN
    -- Renda editada no lead (tela antiga) → Pessoa (fonte nova).
    IF NEW.renda_formal IS DISTINCT FROM OLD.renda_formal OR NEW.renda_informal IS DISTINCT FROM OLD.renda_informal THEN
      UPDATE pessoas SET renda_formal = NEW.renda_formal, renda_informal = NEW.renda_informal
      WHERE id = NEW.pessoa_id
        AND (renda_formal IS DISTINCT FROM NEW.renda_formal OR renda_informal IS DISTINCT FROM NEW.renda_informal);
    END IF;
    IF NEW.conjuge_renda_formal IS DISTINCT FROM OLD.conjuge_renda_formal OR NEW.conjuge_renda_informal IS DISTINCT FROM OLD.conjuge_renda_informal THEN
      SELECT coalesce(NEW.conjuge_pessoa_id, conjuge_pessoa_id) INTO v_conj FROM pessoas WHERE id = NEW.pessoa_id;
      IF v_conj IS NOT NULL THEN
        UPDATE pessoas SET renda_formal = NEW.conjuge_renda_formal, renda_informal = NEW.conjuge_renda_informal
        WHERE id = v_conj
          AND (renda_formal IS DISTINCT FROM NEW.conjuge_renda_formal OR renda_informal IS DISTINCT FROM NEW.conjuge_renda_informal);
      END IF;
    END IF;
  END IF;
  PERFORM pv2_sincronizar_lead(NEW.id);
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_pv2_leads ON leads;
CREATE TRIGGER trg_pv2_leads AFTER INSERT OR UPDATE OF
  pessoa_id, conjuge_pessoa_id, conjuge_nome, conjuge_cpf, conjuge_data_nascimento,
  conjuge_renda_formal, conjuge_renda_informal, renda_formal, renda_informal, estado_civil, vendedor_pessoa_id
  ON leads FOR EACH ROW EXECUTE FUNCTION fn_pv2_leads();

CREATE OR REPLACE FUNCTION fn_pv2_lead_filhos() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NULL; END IF;
  PERFORM pv2_sincronizar_lead(CASE WHEN TG_OP = 'DELETE' THEN OLD.lead_id ELSE NEW.lead_id END);
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_pv2_lead_coparticipantes ON lead_coparticipantes;
CREATE TRIGGER trg_pv2_lead_coparticipantes AFTER INSERT OR UPDATE OR DELETE ON lead_coparticipantes
  FOR EACH ROW EXECUTE FUNCTION fn_pv2_lead_filhos();
DROP TRIGGER IF EXISTS trg_pv2_lead_vendedores ON lead_vendedores;
CREATE TRIGGER trg_pv2_lead_vendedores AFTER INSERT OR UPDATE OR DELETE ON lead_vendedores
  FOR EACH ROW EXECUTE FUNCTION fn_pv2_lead_filhos();

CREATE OR REPLACE FUNCTION fn_pv2_processo_filhos() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NULL; END IF;
  PERFORM pv2_sincronizar_processo(CASE WHEN TG_OP = 'DELETE' THEN OLD.processo_id ELSE NEW.processo_id END);
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_pv2_processo_compradores ON processo_compradores;
CREATE TRIGGER trg_pv2_processo_compradores AFTER INSERT OR UPDATE OR DELETE ON processo_compradores
  FOR EACH ROW EXECUTE FUNCTION fn_pv2_processo_filhos();
DROP TRIGGER IF EXISTS trg_pv2_processo_vendedores ON processo_vendedores;
CREATE TRIGGER trg_pv2_processo_vendedores AFTER INSERT OR UPDATE OR DELETE ON processo_vendedores
  FOR EACH ROW EXECUTE FUNCTION fn_pv2_processo_filhos();

CREATE OR REPLACE FUNCTION fn_pv2_pessoas() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NULL; END IF;
  -- Fim de casamento pela tela antiga: troca/remoção do cônjuge ou estado civil não-casado.
  IF OLD.conjuge_pessoa_id IS NOT NULL
     AND (NEW.conjuge_pessoa_id IS DISTINCT FROM OLD.conjuge_pessoa_id
          OR coalesce(NEW.estado_civil, '') NOT IN ('casado', 'uniao_estavel')) THEN
    UPDATE pessoa_relacionamentos SET data_fim = current_date
    WHERE data_fim IS NULL
      AND pessoa_a_id = least(NEW.id, OLD.conjuge_pessoa_id)
      AND pessoa_b_id = greatest(NEW.id, OLD.conjuge_pessoa_id);
  END IF;
  PERFORM pv2_sincronizar_relacionamento_pessoa(NEW.id);
  FOR r IN SELECT id FROM leads WHERE pessoa_id = NEW.id AND deleted_at IS NULL LOOP
    PERFORM pv2_sincronizar_lead(r.id);
  END LOOP;
  FOR r IN SELECT DISTINCT processo_id FROM processo_compradores WHERE pessoa_id = NEW.id LOOP
    PERFORM pv2_sincronizar_processo(r.processo_id);
  END LOOP;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_pv2_pessoas ON pessoas;
CREATE TRIGGER trg_pv2_pessoas AFTER UPDATE OF
  conjuge_pessoa_id, estado_civil, regime_casamento, data_casamento, conjuge_nome, conjuge_cpf
  ON pessoas FOR EACH ROW EXECUTE FUNCTION fn_pv2_pessoas();

-- ── Backfill ────────────────────────────────────────────────────
-- Renda: Pessoa vence; Pessoa sem renda recebe a do lead mais recente.
UPDATE pessoas p
SET renda_formal   = coalesce(p.renda_formal, x.renda_formal),
    renda_informal = coalesce(p.renda_informal, x.renda_informal)
FROM (
  SELECT DISTINCT ON (pessoa_id) pessoa_id, renda_formal, renda_informal
  FROM leads WHERE deleted_at IS NULL AND pessoa_id IS NOT NULL
  ORDER BY pessoa_id, created_at DESC
) x
WHERE x.pessoa_id = p.id
  AND ((p.renda_formal IS NULL AND x.renda_formal IS NOT NULL) OR (p.renda_informal IS NULL AND x.renda_informal IS NOT NULL));

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM pessoas
           WHERE deleted_at IS NULL
             AND (conjuge_pessoa_id IS NOT NULL OR coalesce(trim(conjuge_nome), '') <> '' OR conjuge_cpf IS NOT NULL)
           ORDER BY created_at LOOP
    PERFORM pv2_sincronizar_relacionamento_pessoa(r.id);
  END LOOP;
  FOR r IN SELECT id FROM leads WHERE deleted_at IS NULL ORDER BY created_at LOOP
    PERFORM pv2_sincronizar_lead(r.id);
  END LOOP;
  FOR r IN SELECT id FROM processos WHERE deleted_at IS NULL ORDER BY created_at LOOP
    PERFORM pv2_sincronizar_processo(r.id);
  END LOOP;
END $$;

COMMIT;
```

- [ ] **Step 4: Rodar o teste dos triggers ANTES do backfill real**

Pedir ao usuário para rodar primeiro só o teste envolvendo a migration numa transação desfeita: colar `BEGIN;` + conteúdo da migration **sem** as linhas `BEGIN;`/`COMMIT;` + conteúdo do teste sem `BEGIN;` + `ROLLBACK;`. Esperado: `NOTICE: OK: triggers participantes v2`. Só então rodar a migration de verdade.

- [ ] **Step 5: Conferência pós-backfill (banco real)**

```sql
SELECT
  (SELECT count(*) FROM leads l WHERE l.deleted_at IS NULL AND l.pessoa_id IS NOT NULL AND NOT pessoa_e_de_operador(l.pessoa_id)
     AND NOT EXISTS (SELECT 1 FROM participacoes pa WHERE pa.lead_id = l.id AND pa.papel = 'titular')) AS leads_sem_titular,
  (SELECT count(*) FROM processos p WHERE p.deleted_at IS NULL
     AND EXISTS (SELECT 1 FROM processo_compradores c WHERE c.processo_id = p.id)
     AND NOT EXISTS (SELECT 1 FROM participacoes pa WHERE pa.processo_id = p.id AND pa.papel = 'titular')) AS processos_sem_titular,
  (SELECT count(*) FROM participacoes) AS participacoes,
  (SELECT count(*) FROM pessoa_relacionamentos WHERE data_fim IS NULL) AS casais_vigentes;
```

Esperado: `leads_sem_titular = 0` e `processos_sem_titular = 0` (fora os casos de operador listados no diagnóstico, bloco 7). Registrar os números no PR.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/2026MMDD_327_participantes_v2_triggers_backfill.sql supabase/testes/participantes_v2_triggers.sql
git commit -m "feat(participantes): triggers de sincronização + backfill V2"
```

---

### Task 6: Módulo `src/lib/participantes` (tipos, carregar, compradores, renda, vagas)

**Files:**
- Create: `src/lib/participantes/tipos.ts`, `carregar.ts`, `compradores.ts`, `renda.ts`, `vagas.ts`
- Test: `src/lib/participantes/__tests__/compradores.test.ts`, `renda.test.ts`, `vagas.test.ts`, `carregar.test.ts`

**Interfaces:**
- Consumes: tipos `DadosComprador`, `DadosVendedor` de `@/lib/formularios/dados`; `criarFakeDb` de `src/lib/documentos/__tests__/helpers/fakeDb.ts`.
- Produces:
  - `type PapelParticipacao = 'titular' | 'coparticipante' | 'conjuge_anuente' | 'vendedor' | 'conjuge_vendedor'`
  - `const PAPEIS_COMPRA: readonly PapelParticipacao[]`, `const PAPEIS_VENDA: readonly PapelParticipacao[]`
  - `type PropostaRef = { tipo: 'lead' | 'processo'; id: string }`
  - `interface RelacionamentoVigente { id: string; pessoa_a_id: string; pessoa_b_id: string; tipo: 'casamento' | 'uniao_estavel'; regime_bens: string | null; data_inicio: string | null }`
  - `type PessoaRow = Record<string, unknown> & { id: string }`
  - `interface ParticipanteCarregado { participacao_id: string; papel: PapelParticipacao; compoe_renda: boolean; ordem: number; pessoa: PessoaRow; conjuge: { pessoa: PessoaRow; relacionamento: RelacionamentoVigente } | null }`
  - `const SELECT_PESSOA_COMPLETA: string`
  - `carregarParticipantes(sb: SupabaseClient, ref: PropostaRef, empresaId: string): Promise<ParticipanteCarregado[]>`
  - `montarCompradores(ps: ParticipanteCarregado[]): DadosComprador[]`
  - `montarVendedores(ps: ParticipanteCarregado[]): DadosVendedor[]`
  - `rendaComposta(ps: Array<Pick<ParticipanteCarregado, 'papel' | 'compoe_renda'> & { pessoa: { id: string; nome?: unknown; renda_formal?: unknown; renda_informal?: unknown } }>): RendaComposta`
  - `interface RendaComposta { formal: number; informal: number; total: number; participantes: Array<{ pessoa_id: string; nome: string; papel: PapelParticipacao; compoe_renda: boolean; formal: number; informal: number }> }`
  - `avisoVagasCompradores(rotulo: string, vagas: number, compradores: Array<{ nome: string }>): string | null`

- [ ] **Step 1: Escrever os testes que falham**

`src/lib/participantes/__tests__/compradores.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { montarCompradores, montarVendedores } from '../compradores'
import type { ParticipanteCarregado } from '../tipos'

const pessoa = (id: string, extra: Record<string, unknown> = {}) => ({
  id, nome: id.toUpperCase(), cpf: null, renda_formal: null, renda_informal: null,
  pessoa_telefones: [{ telefone: '5544999990000', principal: true, ativo: true }], ...extra,
})
const rel = (a: string, b: string) => ({ id: `r-${a}-${b}`, pessoa_a_id: a, pessoa_b_id: b, tipo: 'casamento' as const, regime_bens: 'comunhao_parcial', data_inicio: '1990-05-01' })

const heitor: ParticipanteCarregado = { participacao_id: 'p1', papel: 'titular', compoe_renda: true, ordem: 1, pessoa: pessoa('heitor'), conjuge: null }
const afranio: ParticipanteCarregado = {
  participacao_id: 'p2', papel: 'coparticipante', compoe_renda: true, ordem: 2,
  pessoa: pessoa('afranio', { estado_civil: 'casado' }),
  conjuge: { pessoa: pessoa('maria', { cpf: '52998224725', profissao: 'Professora', renda_formal: 2000 }), relacionamento: rel('afranio', 'maria') },
}
const maria: ParticipanteCarregado = {
  participacao_id: 'p3', papel: 'conjuge_anuente', compoe_renda: false, ordem: 3,
  pessoa: pessoa('maria', { estado_civil: 'casado' }), conjuge: { pessoa: pessoa('afranio'), relacionamento: rel('afranio', 'maria') },
}
const vendedor: ParticipanteCarregado = {
  participacao_id: 'p4', papel: 'vendedor', compoe_renda: false, ordem: 1,
  pessoa: pessoa('vend', { conta_bancaria_banco: '001', conta_bancaria_agencia: '1234', conta_bancaria_numero: '999' }),
  conjuge: { pessoa: pessoa('vendesposa', { cpf: '11144477735' }), relacionamento: rel('vend', 'vendesposa') },
}

describe('montarCompradores', () => {
  it('só lado da compra, titular principal e primeiro', () => {
    const r = montarCompradores([afranio, vendedor, maria, heitor])
    expect(r.map(c => c.id)).toEqual(['heitor', 'afranio', 'maria'])
    expect(r.map(c => c.principal)).toEqual([true, false, false])
  })
  it('cônjuge vem do Relacionamento: nome, cpf, regime e data do casal', () => {
    const [, a] = montarCompradores([heitor, afranio])
    expect(a.conjuge_nome).toBe('MARIA')
    expect(a.conjuge_cpf).toBe('52998224725')
    expect(a.conjuge_profissao).toBe('Professora')
    expect(a.conjuge_renda_formal).toBe(2000)
    expect(a.regime_casamento).toBe('comunhao_parcial')
    expect(a.data_casamento).toBe('1990-05-01')
  })
  it('sem relacionamento, campos de cônjuge ficam nulos', () => {
    const [h] = montarCompradores([heitor])
    expect(h.conjuge_nome).toBeNull()
    expect(h.regime_casamento).toBeNull()
  })
  it('telefone principal ativo', () => {
    expect(montarCompradores([heitor])[0].telefone).toBe('5544999990000')
  })
})

describe('montarVendedores', () => {
  it('só vendedores, com conta da Pessoa e cônjuge do Relacionamento', () => {
    const r = montarVendedores([heitor, vendedor])
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ id: 'vend', banco: '001', agencia: '1234', conta: '999', conjuge_nome: 'VENDESPOSA', conjuge_cpf: '11144477735' })
  })
})
```

`src/lib/participantes/__tests__/renda.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { rendaComposta } from '../renda'

const p = (id: string, papel: string, compoe: boolean, formal: number | null, informal: number | null) =>
  ({ papel: papel as never, compoe_renda: compoe, pessoa: { id, nome: id, renda_formal: formal, renda_informal: informal } })

describe('rendaComposta', () => {
  it('soma só quem compõe renda, no lado da compra', () => {
    const r = rendaComposta([
      p('heitor', 'titular', true, 5000, 1000),
      p('afranio', 'coparticipante', true, 8000, null),
      p('maria', 'conjuge_anuente', false, 3000, null),
      p('vend', 'vendedor', true, 99999, null),
    ])
    expect(r).toMatchObject({ formal: 13000, informal: 1000, total: 14000 })
    expect(r.participantes.map(x => x.pessoa_id)).toEqual(['heitor', 'afranio', 'maria'])
  })
  it('valores em texto do PostgREST (numeric) viram número', () => {
    expect(rendaComposta([p('a', 'titular', true, '1500.50' as never, null)]).total).toBe(1500.5)
  })
})
```

`src/lib/participantes/__tests__/vagas.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { avisoVagasCompradores } from '../vagas'

describe('avisoVagasCompradores', () => {
  it('null quando cabe', () => {
    expect(avisoVagasCompradores('BB — Comprador', 3, [{ nome: 'A' }, { nome: 'B' }])).toBeNull()
  })
  it('lista quem ficou de fora', () => {
    expect(avisoVagasCompradores('Bradesco — Autorização', 2, [{ nome: 'Heitor' }, { nome: 'Afrânio' }, { nome: 'Maria' }]))
      .toBe('Bradesco — Autorização: o formulário tem 2 comprador(es) e a proposta tem 3. Ficou de fora: Maria — gere uma 2ª via para ele(s).')
  })
})
```

`src/lib/participantes/__tests__/carregar.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { criarFakeDb } from '@/lib/documentos/__tests__/helpers/fakeDb'
import { carregarParticipantes } from '../carregar'

describe('carregarParticipantes', () => {
  it('carrega pessoas, resolve cônjuge (inclusive de fora da proposta) e ordena titular primeiro', async () => {
    const db = criarFakeDb({
      participacoes: [
        { id: 'pa2', empresa_id: 'e1', lead_id: 'l1', pessoa_id: 'afranio', papel: 'coparticipante', compoe_renda: true, ordem: 2 },
        { id: 'pa1', empresa_id: 'e1', lead_id: 'l1', pessoa_id: 'heitor', papel: 'titular', compoe_renda: true, ordem: 1 },
        { id: 'pa9', empresa_id: 'e1', lead_id: 'outro', pessoa_id: 'x', papel: 'titular', compoe_renda: true, ordem: 1 },
      ],
      pessoa_relacionamentos: [
        { id: 'r1', pessoa_a_id: 'afranio', pessoa_b_id: 'maria', tipo: 'casamento', regime_bens: null, data_inicio: null, data_fim: null },
        { id: 'r0', pessoa_a_id: 'heitor', pessoa_b_id: 'ex', tipo: 'casamento', regime_bens: null, data_inicio: null, data_fim: '2020-01-01' },
      ],
      pessoas: [
        { id: 'heitor', nome: 'Heitor', deleted_at: null },
        { id: 'afranio', nome: 'Afrânio', deleted_at: null },
        { id: 'maria', nome: 'Maria', deleted_at: null },
        { id: 'ex', nome: 'Ex', deleted_at: null },
      ],
    })
    const r = await carregarParticipantes(db as never, { tipo: 'lead', id: 'l1' }, 'e1')
    expect(r.map(p => p.pessoa.id)).toEqual(['heitor', 'afranio'])
    expect(r[0].conjuge).toBeNull() // relacionamento encerrado não conta
    expect(r[1].conjuge?.pessoa.nome).toBe('Maria')
  })
  it('lista vazia sem participações', async () => {
    const db = criarFakeDb({ participacoes: [] })
    expect(await carregarParticipantes(db as never, { tipo: 'processo', id: 'p1' }, 'e1')).toEqual([])
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run --exclude ".claude/**" --exclude "output/**" src/lib/participantes`
Expected: FAIL — `Failed to resolve import "../compradores"` (e demais módulos).

- [ ] **Step 3: Implementar**

`src/lib/participantes/tipos.ts`:

```ts
/** Participantes V2 (spec 2026-09-28-participantes-v2-design.md). */
export type PapelParticipacao = 'titular' | 'coparticipante' | 'conjuge_anuente' | 'vendedor' | 'conjuge_vendedor'

export const PAPEIS_COMPRA: readonly PapelParticipacao[] = ['titular', 'coparticipante', 'conjuge_anuente']
export const PAPEIS_VENDA: readonly PapelParticipacao[] = ['vendedor', 'conjuge_vendedor']

export type PropostaRef = { tipo: 'lead' | 'processo'; id: string }

export interface RelacionamentoVigente {
  id: string
  pessoa_a_id: string
  pessoa_b_id: string
  tipo: 'casamento' | 'uniao_estavel'
  regime_bens: string | null
  data_inicio: string | null
}

export type PessoaRow = Record<string, unknown> & { id: string }

export interface ParticipanteCarregado {
  participacao_id: string
  papel: PapelParticipacao
  compoe_renda: boolean
  ordem: number
  pessoa: PessoaRow
  conjuge: { pessoa: PessoaRow; relacionamento: RelacionamentoVigente } | null
}
```

`src/lib/participantes/carregar.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ParticipanteCarregado, PapelParticipacao, PessoaRow, PropostaRef, RelacionamentoVigente } from './tipos'

/** Colunas da Pessoa usadas por formulários/contratos. Sem conjuge_* nem regime/data: vêm do Relacionamento. */
export const SELECT_PESSOA_COMPLETA = `
  id, nome, cpf, email, data_nascimento, rg, profissao,
  estado_civil, sexo, renda_formal, renda_informal, nacionalidade,
  endereco_rua, endereco_numero, endereco_bairro, endereco_cidade, endereco_uf, endereco_cep,
  empresa_nome, empresa_cnpj, municipio_trabalho, uf_trabalho,
  conta_bancaria_banco, conta_bancaria_agencia, conta_bancaria_numero, conta_bancaria_digito,
  pessoa_telefones(telefone, principal, ativo)
`

const PRIORIDADE: Record<PapelParticipacao, number> = {
  titular: 0, coparticipante: 1, conjuge_anuente: 1, vendedor: 2, conjuge_vendedor: 2,
}
const SELECT_REL = 'id, pessoa_a_id, pessoa_b_id, tipo, regime_bens, data_inicio'

type LinhaParticipacao = { id: string; pessoa_id: string; papel: PapelParticipacao; compoe_renda: boolean; ordem: number }

export async function carregarParticipantes(sb: SupabaseClient, ref: PropostaRef, empresaId: string): Promise<ParticipanteCarregado[]> {
  const coluna = ref.tipo === 'lead' ? 'lead_id' : 'processo_id'
  const { data: parts, error } = await sb.from('participacoes')
    .select('id, pessoa_id, papel, compoe_renda, ordem')
    .eq(coluna, ref.id).eq('empresa_id', empresaId)
  if (error) throw new Error(`participacoes: ${error.message}`)
  const linhas = (parts ?? []) as LinhaParticipacao[]
  if (linhas.length === 0) return []

  const ids = linhas.map(l => l.pessoa_id)
  const [ra, rb] = await Promise.all([
    sb.from('pessoa_relacionamentos').select(SELECT_REL).in('pessoa_a_id', ids).is('data_fim', null),
    sb.from('pessoa_relacionamentos').select(SELECT_REL).in('pessoa_b_id', ids).is('data_fim', null),
  ])
  if (ra.error || rb.error) throw new Error(`pessoa_relacionamentos: ${(ra.error ?? rb.error)!.message}`)
  const rels = new Map<string, RelacionamentoVigente>()
  for (const r of [...(ra.data ?? []), ...(rb.data ?? [])] as RelacionamentoVigente[]) rels.set(r.id, r)
  const relDe = new Map<string, RelacionamentoVigente>()
  for (const r of rels.values()) { relDe.set(r.pessoa_a_id, r); relDe.set(r.pessoa_b_id, r) }
  const outro = (r: RelacionamentoVigente, id: string) => (r.pessoa_a_id === id ? r.pessoa_b_id : r.pessoa_a_id)

  const todos = Array.from(new Set([...ids, ...Array.from(rels.values()).flatMap(r => [r.pessoa_a_id, r.pessoa_b_id])]))
  const { data: pessoas, error: eP } = await sb.from('pessoas').select(SELECT_PESSOA_COMPLETA).in('id', todos).is('deleted_at', null)
  if (eP) throw new Error(`pessoas: ${eP.message}`)
  const porId = new Map((pessoas ?? []).map(p => [(p as PessoaRow).id, p as PessoaRow]))

  const resultado: ParticipanteCarregado[] = []
  for (const l of linhas) {
    const pessoa = porId.get(l.pessoa_id)
    if (!pessoa) continue // Pessoa excluída (soft delete)
    const rel = relDe.get(l.pessoa_id)
    const conjPessoa = rel ? porId.get(outro(rel, l.pessoa_id)) : undefined
    resultado.push({
      participacao_id: l.id, papel: l.papel, compoe_renda: l.compoe_renda, ordem: l.ordem, pessoa,
      conjuge: rel && conjPessoa ? { pessoa: conjPessoa, relacionamento: rel } : null,
    })
  }
  return resultado.sort((a, b) => PRIORIDADE[a.papel] - PRIORIDADE[b.papel] || a.ordem - b.ordem)
}
```

`src/lib/participantes/compradores.ts`:

```ts
import type { DadosComprador, DadosVendedor } from '@/lib/formularios/dados'
import { PAPEIS_COMPRA, type ParticipanteCarregado, type PessoaRow } from './tipos'

const s = (p: PessoaRow, c: string) => (p[c] as string | null | undefined) ?? null
const n = (p: PessoaRow, c: string) => { const v = p[c]; return v == null ? null : Number(v) }

function telefonePrincipal(p: PessoaRow): string | null {
  const tels = ((p.pessoa_telefones as Array<{ telefone: string; principal: boolean; ativo: boolean }> | undefined) ?? []).filter(t => t.ativo)
  return (tels.find(t => t.principal) ?? tels[0])?.telefone ?? null
}

function paraComprador(pt: ParticipanteCarregado): DadosComprador {
  const p = pt.pessoa
  const c = pt.conjuge?.pessoa ?? null
  const rel = pt.conjuge?.relacionamento ?? null
  return {
    id: p.id,
    nome: s(p, 'nome') ?? '',
    cpf: s(p, 'cpf'),
    email: s(p, 'email'),
    telefone: telefonePrincipal(p),
    data_nascimento: s(p, 'data_nascimento'),
    rg: s(p, 'rg'),
    profissao: s(p, 'profissao'),
    estado_civil: s(p, 'estado_civil'),
    sexo: s(p, 'sexo'),
    renda_formal: n(p, 'renda_formal'),
    renda_informal: n(p, 'renda_informal'),
    nacionalidade: s(p, 'nacionalidade'),
    endereco_rua: s(p, 'endereco_rua'),
    endereco_numero: s(p, 'endereco_numero'),
    endereco_bairro: s(p, 'endereco_bairro'),
    endereco_cidade: s(p, 'endereco_cidade'),
    endereco_uf: s(p, 'endereco_uf'),
    endereco_cep: s(p, 'endereco_cep'),
    regime_casamento: rel?.regime_bens ?? null,
    data_casamento: rel?.data_inicio ?? null,
    conjuge_nome: c ? s(c, 'nome') : null,
    conjuge_cpf: c ? s(c, 'cpf') : null,
    conjuge_data_nascimento: c ? s(c, 'data_nascimento') : null,
    conjuge_profissao: c ? s(c, 'profissao') : null,
    conjuge_renda_formal: c ? n(c, 'renda_formal') : null,
    empresa_nome: s(p, 'empresa_nome'),
    empresa_cnpj: s(p, 'empresa_cnpj'),
    municipio_trabalho: s(p, 'municipio_trabalho'),
    uf_trabalho: s(p, 'uf_trabalho'),
    conta_bancaria_banco: s(p, 'conta_bancaria_banco'),
    conta_bancaria_agencia: s(p, 'conta_bancaria_agencia'),
    conta_bancaria_numero: s(p, 'conta_bancaria_numero'),
    conta_bancaria_digito: s(p, 'conta_bancaria_digito'),
    principal: pt.papel === 'titular',
  }
}

/** Lado da compra, na ordem da proposta (titular primeiro). Espera a lista já ordenada por carregarParticipantes. */
export function montarCompradores(ps: ParticipanteCarregado[]): DadosComprador[] {
  const compra = ps.filter(p => PAPEIS_COMPRA.includes(p.papel))
  const ordenada = [...compra.filter(p => p.papel === 'titular'), ...compra.filter(p => p.papel !== 'titular')]
  return ordenada.map(paraComprador)
}

/** Só quem vende (papel 'vendedor'); o cônjuge que só assina aparece como conjuge_* do vendedor. */
export function montarVendedores(ps: ParticipanteCarregado[]): DadosVendedor[] {
  return ps.filter(p => p.papel === 'vendedor').map(pt => {
    const p = pt.pessoa
    const c = pt.conjuge?.pessoa ?? null
    return {
      id: p.id,
      nome: s(p, 'nome') ?? '',
      cpf: s(p, 'cpf'),
      email: s(p, 'email'),
      telefone: telefonePrincipal(p),
      estado_civil: s(p, 'estado_civil'),
      banco: s(p, 'conta_bancaria_banco'),
      agencia: s(p, 'conta_bancaria_agencia'),
      conta: s(p, 'conta_bancaria_numero'),
      conjuge_nome: c ? s(c, 'nome') : null,
      conjuge_cpf: c ? s(c, 'cpf') : null,
    }
  })
}
```

`src/lib/participantes/renda.ts`:

```ts
import { PAPEIS_COMPRA, type PapelParticipacao } from './tipos'

export interface RendaComposta {
  formal: number
  informal: number
  total: number
  participantes: Array<{ pessoa_id: string; nome: string; papel: PapelParticipacao; compoe_renda: boolean; formal: number; informal: number }>
}

type Entrada = { papel: PapelParticipacao; compoe_renda: boolean; pessoa: { id: string; nome?: unknown; renda_formal?: unknown; renda_informal?: unknown } }
const num = (v: unknown) => (v == null || v === '' ? 0 : Number(v) || 0)

/** Soma a renda de quem compõe renda no lado da compra. Renda sempre da Pessoa. */
export function rendaComposta(ps: Entrada[]): RendaComposta {
  const participantes = ps.filter(p => PAPEIS_COMPRA.includes(p.papel)).map(p => ({
    pessoa_id: p.pessoa.id, nome: String(p.pessoa.nome ?? ''), papel: p.papel, compoe_renda: p.compoe_renda,
    formal: num(p.pessoa.renda_formal), informal: num(p.pessoa.renda_informal),
  }))
  const somados = participantes.filter(p => p.compoe_renda)
  const formal = somados.reduce((t, p) => t + p.formal, 0)
  const informal = somados.reduce((t, p) => t + p.informal, 0)
  return { formal, informal, total: formal + informal, participantes }
}
```

`src/lib/participantes/vagas.ts`:

```ts
/** Formulário de banco com N vagas e proposta com mais compradores: avisar, nunca cortar em silêncio. */
export function avisoVagasCompradores(rotulo: string, vagas: number, compradores: Array<{ nome: string }>): string | null {
  if (compradores.length <= vagas) return null
  const fora = compradores.slice(vagas).map(c => c.nome).join(', ')
  return `${rotulo}: o formulário tem ${vagas} comprador(es) e a proposta tem ${compradores.length}. Ficou de fora: ${fora} — gere uma 2ª via para ele(s).`
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run --exclude ".claude/**" --exclude "output/**" src/lib/participantes`
Expected: PASS (4 arquivos). Depois `npm run typecheck` — sem erro novo.

- [ ] **Step 5: Commit**

```bash
git add src/lib/participantes
git commit -m "feat(participantes): módulo de leitura (carregar, compradores, renda, vagas)"
```

---

### Task 7: Formulários leem Participações + aviso de vagas

**Files:**
- Modify: `src/lib/formularios/dados-lead.ts` (inteiro: `pessoaParaComprador`, `SELECT_PESSOA_COMPLETA` locais e passos 2b/2c/3 somem)
- Modify: `src/lib/formularios/dados.ts:106-205` (busca de compradores e vendedores)
- Modify: `src/app/api/processos/[id]/formularios/route.ts` (tipo `FormularioDef` + resposta)
- Modify: `src/app/api/leads/[id]/formularios/route.ts` (mesmo)
- Modify: componente(s) que chamam essas rotas (achar com `grep -rn "/formularios" src/components src/app --include=*.tsx`)
- Test: `src/lib/formularios/__tests__/dados-participantes.test.ts`

**Interfaces:**
- Consumes: `carregarParticipantes`, `montarCompradores`, `montarVendedores`, `avisoVagasCompradores` (Task 6).
- Produces: `buscarDadosFormularioLead(leadId)` e `buscarDadosFormulario(processoId)` com a mesma assinatura de hoje; rotas de formulário passam a devolver `avisos: string[]` no JSON.

- [ ] **Step 1: Teste que falha**

`src/lib/formularios/__tests__/dados-participantes.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Row } from '@/lib/documentos/__tests__/helpers/fakeDb'

const estado = vi.hoisted(() => ({ tabelas: {} as Record<string, Row[]> }))
vi.mock('@/lib/supabase/admin', async () => {
  const { criarFakeDb } = await import('@/lib/documentos/__tests__/helpers/fakeDb')
  return { supabaseAdmin: { from: (t: string) => criarFakeDb(estado.tabelas).from(t) } }
})

beforeEach(() => {
  estado.tabelas = {
    leads: [{ id: 'l1', empresa_id: 'e1', nome: 'Lead', pessoa_id: 'heitor', cidade_imovel: 'Maringá', conjuge_nome: 'NÃO USAR' }],
    participacoes: [
      { id: 'a', empresa_id: 'e1', lead_id: 'l1', pessoa_id: 'heitor', papel: 'titular', compoe_renda: true, ordem: 1 },
      { id: 'b', empresa_id: 'e1', lead_id: 'l1', pessoa_id: 'afranio', papel: 'coparticipante', compoe_renda: true, ordem: 2 },
    ],
    pessoa_relacionamentos: [{ id: 'r', pessoa_a_id: 'afranio', pessoa_b_id: 'maria', tipo: 'casamento', regime_bens: 'comunhao_parcial', data_inicio: null, data_fim: null }],
    pessoas: [
      { id: 'heitor', nome: 'Heitor', deleted_at: null },
      { id: 'afranio', nome: 'Afrânio', deleted_at: null },
      { id: 'maria', nome: 'Maria', deleted_at: null },
    ],
    pessoa_fgts_contas: [],
  }
})

describe('buscarDadosFormularioLead', () => {
  it('compradores = participações; cônjuge do coparticipante pelo Relacionamento; campos soltos do lead ignorados', async () => {
    const { buscarDadosFormularioLead } = await import('../dados-lead')
    const d = await buscarDadosFormularioLead('l1')
    expect(d.compradores.map(c => c.nome)).toEqual(['Heitor', 'Afrânio'])
    expect(d.compradores[0].principal).toBe(true)
    expect(d.compradores[0].conjuge_nome).toBeNull()
    expect(d.compradores[1].conjuge_nome).toBe('Maria')
    expect(d.compradores[1].regime_casamento).toBe('comunhao_parcial')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run --exclude ".claude/**" --exclude "output/**" src/lib/formularios/__tests__/dados-participantes.test.ts`
Expected: FAIL — `compradores[0].conjuge_nome` = `'NÃO USAR'` ou nomes divergentes (código antigo lê campos soltos/`lead_coparticipantes`).

- [ ] **Step 3: Implementar em `dados-lead.ts`**

Substituir o arquivo inteiro por:

```ts
// Adapta dados de um Lead para a estrutura DadosProcesso usada pelos mappers.
// Participantes V2: compradores vêm só de `participacoes` (spec 2026-09-28).
import type { DadosProcesso, DadosFgts } from './dados'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { carregarParticipantes } from '@/lib/participantes/carregar'
import { montarCompradores, montarVendedores } from '@/lib/participantes/compradores'

export async function buscarDadosFormularioLead(leadId: string): Promise<DadosProcesso> {
  const sb = supabaseAdmin
  const { data: lead, error: errLead } = await sb
    .from('leads')
    .select('id, empresa_id, banco_pretendido, valor_imovel, valor_pretendido, entrada, prazo_meses, cidade_imovel, tipo_imovel')
    .eq('id', leadId)
    .single()
  if (errLead) throw errLead

  const participantes = await carregarParticipantes(sb, { tipo: 'lead', id: lead.id }, lead.empresa_id)
  const compradores = montarCompradores(participantes)

  let fgtsContas: DadosFgts[] = []
  const titular = compradores.find(c => c.principal)
  if (titular) {
    const { data: fgtsRows, error: eF } = await sb
      .from('pessoa_fgts_contas')
      .select('pis_pasep, cod_empregador, nro_conta_fgts, valor_saque, saldo_disponivel')
      .eq('pessoa_id', titular.id)
      .order('created_at', { ascending: true })
    if (eF) throw eF
    fgtsContas = fgtsRows ?? []
  }

  return {
    id:                              lead.id,
    empresa_id:                      lead.empresa_id,
    numero_processo:                 `LEAD-${lead.id.slice(0, 8).toUpperCase()}`,
    banco_nome:                      lead.banco_pretendido ?? null,
    modalidade:                      'financiamento',
    valor_imovel:                    lead.valor_imovel ?? null,
    valor_financiado:                lead.valor_pretendido ?? null,
    valor_entrada:                   lead.entrada ?? null,
    valor_recursos_proprios:         null,
    valor_fgts:                      null,
    prazo_amortizacao_meses:         lead.prazo_meses ?? null,
    dia_vencimento_parcela:          null,
    sistema_amortizacao:             null,
    indexador:                       null,
    financiar_despesas_cartorariais: false,
    compradores,
    vendedores:                      montarVendedores(participantes),
    imovel: {
      rua: null, numero: null, bairro: null,
      cidade: lead.cidade_imovel ?? null,
      uf: null, cep: null, apto_unidade: null, categoria: null,
      tipo: lead.tipo_imovel ?? null,
      matricula: null,
    },
    fgts_comprador1: fgtsContas,
  }
}
```

Nota para o PR: o fallback antigo `endereco_cidade ?? lead.cidade_imovel` saiu de propósito — cidade do imóvel não é endereço do comprador.

- [ ] **Step 4: Implementar em `dados.ts`**

Em `buscarDadosFormulario`, trocar o bloco de `// Buscar compradores com dados completos de pessoas` até o fim de `// Buscar vendedores` (as queries a `processo_compradores`/`processo_vendedores`, o `rows.map` e o `errVend`) por:

```ts
  const participantes = await carregarParticipantes(sb, { tipo: 'processo', id: proc.id }, proc.empresa_id)
  const compradores = montarCompradores(participantes)
  const vendedores = montarVendedores(participantes)
```

e no `return`, usar `vendedores` no lugar de `vendRows ?? []` (conferir o nome usado hoje no objeto de retorno e trocar). Adicionar no topo:

```ts
import { carregarParticipantes } from '@/lib/participantes/carregar'
import { montarCompradores, montarVendedores } from '@/lib/participantes/compradores'
```

Os tipos `DadosPessoa`/`DadosComprador`/`DadosVendedor` continuam iguais — os mappers de banco não mudam.

- [ ] **Step 5: Aviso de vagas nas duas rotas**

Em `src/app/api/processos/[id]/formularios/route.ts` e `src/app/api/leads/[id]/formularios/route.ts`: acrescentar `vagasCompradores?: number` ao tipo `FormularioDef` e preencher nas definições existentes:

| Mapa | `vagasCompradores` | Motivo (código do mapper) |
|---|---|---|
| `mapaCompradorBB` | 3 | `compradores.slice(0, 3)` |
| `mapaProposta` (Bradesco) | 4 | `compradores.slice(0, 4)` |
| `mapaAutorizacao` (Bradesco) | 2 | usa `compradores[0]` e `[1]` |
| `mapaAutorizacaoSantander` | 2 | usa `compradores[0]` e `[1]` |

Os demais (FGTS, DPS, IR, SCR, IQ vendedor) usam só o principal — sem aviso. No laço que gera os PDFs, antes de preencher cada formulário:

```ts
const avisos: string[] = []
// dentro do laço, para cada def:
if (def.vagasCompradores) {
  const aviso = avisoVagasCompradores(def.label, def.vagasCompradores, dados.compradores)
  if (aviso) avisos.push(aviso)
}
```

e incluir `avisos` no objeto do `NextResponse.json(...)` de sucesso. Import: `import { avisoVagasCompradores } from '@/lib/participantes/vagas'`.

No componente que chama a rota (achado pelo grep da lista de Files), depois de ler o JSON de sucesso:

```ts
if (Array.isArray(json.avisos) && json.avisos.length) toast.warning(json.avisos.join('\n'), { duration: 12000 })
```

(`import { toast } from 'sonner'`, se o componente ainda não importar.)

- [ ] **Step 6: Rodar testes e typecheck**

Run: `npx vitest run --exclude ".claude/**" --exclude "output/**" src/lib/formularios src/lib/participantes` → PASS.
Run: `npm run typecheck` → sem erro novo.

- [ ] **Step 7: Conferência no banco real**

Com o usuário, gerar os formulários do BB de um negócio real que tenha cônjuge e comparar com um PDF gerado antes (mesmos nomes/CPFs/regime). Registrar no PR.

- [ ] **Step 8: Commit**

```bash
git add src/lib/formularios src/app/api/processos/[id]/formularios/route.ts src/app/api/leads/[id]/formularios/route.ts <componente-alterado>
git commit -m "feat(formularios): compradores e vendedores vêm das participações + aviso de vagas"
```

---

### Task 8: Vínculos e destinos de documento leem Participações

**Files:**
- Modify: `src/lib/documentos/vinculosServidor.ts` (`participantesDaEntidade`)
- Modify: `src/lib/documentos/destinosVinculo.ts:33-58` (`buscarDestinos`, bloco das 4 queries e do `for` dos leads)
- Modify: `src/lib/documentos/destinosVinculo.ts:70-72` (busca livre por pessoas)
- Test: `src/lib/documentos/__tests__/vinculosServidor.test.ts`, `src/lib/documentos/__tests__/destinosVinculo.test.ts` (atualizar fixtures)

**Interfaces:**
- Consumes: `PAPEIS_COMPRA`, `PAPEIS_VENDA` (Task 6).
- Produces: mesmas assinaturas de hoje (`participantesDaEntidade`, `buscarDestinos`).

- [ ] **Step 1: Atualizar testes para o modelo novo (falham)**

Em `vinculosServidor.test.ts`, trocar as fixtures do `beforeEach` por participações equivalentes e acrescentar o caso do coparticipante do lead:

```ts
beforeEach(() => {
  estado.pode = true
  estado.tabelas = {
    leads: [{ id: 'l1', empresa_id: 'e1', deleted_at: null }],
    participacoes: [
      { empresa_id: 'e1', lead_id: 'l1', pessoa_id: 'titular', papel: 'titular' },
      { empresa_id: 'e1', lead_id: 'l1', pessoa_id: 'conj', papel: 'conjuge_anuente' },
      { empresa_id: 'e1', lead_id: 'l1', pessoa_id: 'cop', papel: 'coparticipante' },
      { empresa_id: 'e1', processo_id: 'pr1', pessoa_id: 'comp', papel: 'titular' },
      { empresa_id: 'e1', processo_id: 'pr1', pessoa_id: 'vend', papel: 'vendedor' },
    ],
  }
})
```

e nos `expect` de `participantesDaEntidade`: lead → `pessoaIds` contém `['titular', 'conj', 'cop']`, `titularLeadPessoaId: 'titular'`; processo → `compradorasIds: ['comp']`, `vendedorasIds: ['vend']`. Em `destinosVinculo.test.ts`, substituir fixtures de `leads.pessoa_id`/`conjuge_pessoa_id`/`processo_compradores`/`processo_vendedores` por linhas de `participacoes` com os mesmos ids, e acrescentar: "coparticipante do lead vê o lead como destino com `pessoa_participa: true`".

Run: `npx vitest run --exclude ".claude/**" --exclude "output/**" src/lib/documentos` → FAIL.

- [ ] **Step 2: Implementar `participantesDaEntidade`**

```ts
export async function participantesDaEntidade(entidadeTipo: EntidadeVinculo, entidadeId: string, empresaId: string): Promise<Participantes> {
  const coluna = entidadeTipo === 'lead' ? 'lead_id' : 'processo_id'
  const { data, error } = await supabase.from('participacoes').select('pessoa_id, papel')
    .eq(coluna, entidadeId).eq('empresa_id', empresaId)
  if (error) throw new Error(`participantes: ${error.message}`)
  const linhas = (data ?? []) as Array<{ pessoa_id: string; papel: PapelParticipacao }>
  const compra = linhas.filter(l => PAPEIS_COMPRA.includes(l.papel)).map(l => l.pessoa_id)
  const venda = linhas.filter(l => PAPEIS_VENDA.includes(l.papel)).map(l => l.pessoa_id)
  if (entidadeTipo === 'lead') {
    // Lead: pasta sugerida não distingue comprador/vendedor (comportamento anterior).
    const titular = linhas.find(l => l.papel === 'titular')?.pessoa_id ?? null
    return { pessoaIds: Array.from(new Set(compra)), compradorasIds: [], vendedorasIds: [], titularLeadPessoaId: titular }
  }
  return { pessoaIds: Array.from(new Set([...compra, ...venda])), compradorasIds: compra, vendedorasIds: venda, titularLeadPessoaId: null }
}
```

Import: `import { PAPEIS_COMPRA, PAPEIS_VENDA, type PapelParticipacao } from '@/lib/participantes/tipos'`. Atualizar o comentário JSDoc acima da função para "Pessoas do lead (lado da compra) ou do negócio (compra + venda), via participacoes".

- [ ] **Step 3: Implementar `buscarDestinos`**

Trocar o `Promise.all` das 4 queries e o cálculo de `idsProcDaPessoa` por:

```ts
  const { data: parts, error: eParts } = await cliente.from('participacoes')
    .select('lead_id, processo_id').eq('pessoa_id', pessoaId)
  if (eParts) throw new Error(`destinos: ${eParts.message}`)
  const idsLeadDaPessoa = Array.from(new Set((parts ?? []).map(r => r.lead_id as string | null).filter((x): x is string => !!x)))
  const idsProcDaPessoa = Array.from(new Set((parts ?? []).map(r => r.processo_id as string | null).filter((x): x is string => !!x)))
  let leadsDaPessoa: LeadRow[] = []
  if (idsLeadDaPessoa.length) {
    const { data, error } = await cliente.from('leads').select(selLead)
      .in('id', idsLeadDaPessoa).is('deleted_at', null).not('status_analise', 'in', fechados)
    if (error) throw new Error(`destinos: ${error.message}`)
    leadsDaPessoa = (data ?? []) as unknown as LeadRow[]
  }
```

e o laço `for (const l of [...(leadsTit.data ?? []), ...(leadsConj.data ?? [])] ...)` vira `for (const l of leadsDaPessoa) add(paraDestinoLead(l, true))`. Na busca livre (linha ~71), trocar `cliente.from('processo_compradores').select('processo_id').in('pessoa_id', idsPessoas)` por `cliente.from('participacoes').select('processo_id').in('pessoa_id', idsPessoas).not('processo_id', 'is', null)` (mesmo tratamento de erro e `limit`).

- [ ] **Step 4: Rodar testes**

Run: `npx vitest run --exclude ".claude/**" --exclude "output/**" src/lib/documentos` → PASS. `npm run typecheck` → sem erro novo.

- [ ] **Step 5: Commit**

```bash
git add src/lib/documentos
git commit -m "feat(documentos): vínculos e destinos consideram todos os participantes"
```

---

### Task 9: Crédito — renda composta de todos os participantes

**Files:**
- Create: `src/hooks/participantes/useParticipantes.ts`
- Modify: `src/components/leads/LeadDetalhe/AbaCredito.tsx:162-167` (KPI) e `:376-412` (bloco de renda: só o total exibido)
- Test: coberto por `renda.test.ts` (Task 6) + conferência manual

**Interfaces:**
- Consumes: `rendaComposta`, `PropostaRef` (Task 6).
- Produces: `useParticipantes(ref: PropostaRef | null)` → `UseQueryResult<Array<{ id: string; papel: PapelParticipacao; compoe_renda: boolean; ordem: number; pessoa: { id: string; nome: string; renda_formal: number | null; renda_informal: number | null } }>>`, queryKey `['leads', id, 'participantes']` para lead e `['processos', id, 'participantes']` para processo (prefixo das invalidações que já existem).

- [ ] **Step 1: Criar o hook**

```ts
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { PapelParticipacao, PropostaRef } from '@/lib/participantes/tipos'

export type ParticipanteResumo = {
  id: string
  papel: PapelParticipacao
  compoe_renda: boolean
  ordem: number
  pessoa: { id: string; nome: string; renda_formal: number | null; renda_informal: number | null }
}

/** Participantes da proposta (RLS decide a visibilidade). Chave sob ['leads', id] / ['processos', id]
 *  para que as invalidações já existentes do lead/processo também recarreguem aqui. */
export function useParticipantes(ref: PropostaRef | null) {
  const supabase = createClient()
  return useQuery({
    queryKey: [ref?.tipo === 'processo' ? 'processos' : 'leads', ref?.id, 'participantes'],
    enabled: !!ref,
    queryFn: async (): Promise<ParticipanteResumo[]> => {
      const coluna = ref!.tipo === 'lead' ? 'lead_id' : 'processo_id'
      const { data, error } = await supabase.from('participacoes')
        .select('id, papel, compoe_renda, ordem, pessoa:pessoas!pessoa_id(id, nome, renda_formal, renda_informal)')
        .eq(coluna, ref!.id)
        .order('ordem', { ascending: true })
      if (error) throw error
      return (data ?? []).map(r => ({ ...r, pessoa: Array.isArray(r.pessoa) ? r.pessoa[0] : r.pessoa })) as ParticipanteResumo[]
    },
  })
}
```

- [ ] **Step 2: KPI da aba Crédito**

Em `AbaCredito.tsx`, substituir as linhas 162-167 (`casadoKpi` … `rendaTotal`) por:

```ts
  const { data: participantes } = useParticipantes({ tipo: 'lead', id: lead.id })
  const renda = rendaComposta(participantes ?? [])
  const rendaFormalKpi   = renda.formal
  const rendaInformalKpi = renda.informal
  const rendaTotal       = renda.total
```

Imports: `useParticipantes` de `@/hooks/participantes/useParticipantes` e `rendaComposta` de `@/lib/participantes/renda`. No bloco das linhas 376-412, trocar só o cálculo exibido `const rendaTotal = totalComprador + (casado ? totalConjuge : 0)` por `rendaComposta(participantes ?? []).total`, lendo `participantes` do mesmo hook (chamar o hook no componente desse bloco). Os campos de edição de renda do cônjuge continuam gravando em `leads.conjuge_renda_*` (Fase A); o trigger da Task 5 leva o valor para a Pessoa e a query é invalidada pela chave `['leads', lead.id]` que `useEditarLead` já invalida — conferir no `onSuccess` de `src/hooks/leads/useEditarLead.ts` que a invalidação é por prefixo `['leads', id]`; se for outra chave, acrescentar `qc.invalidateQueries({ queryKey: ['leads', id, 'participantes'] })`.

- [ ] **Step 3: Typecheck e conferência manual**

Run: `npm run typecheck`. Com `npm run dev`, abrir um lead com coparticipante: o KPI "Renda total" agora soma titular + coparticipante (antes ignorava coparticipante — mudança esperada, registrar no PR). Editar a renda do cônjuge e salvar: o total muda sem F5.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/participantes src/components/leads/LeadDetalhe/AbaCredito.tsx src/hooks/leads/useEditarLead.ts
git commit -m "feat(credito): renda total soma todos os participantes que compõem renda"
```

---

### Task 10: Bot encontra o lead de quem é participante

**Files:**
- Create: `src/lib/participantes/leadDaPessoa.ts`
- Modify: `src/lib/bot/fonti-comandos.ts:795-797` (ramo fromMe) e `:898-907` (fim de `buscarEntidade`)
- Test: `src/lib/participantes/__tests__/leadDaPessoa.test.ts`

**Interfaces:**
- Produces: `leadMaisRecenteDaPessoa(sb: SupabaseClient, empresaId: string, pessoaId: string): Promise<string | null>` — titular primeiro (comportamento antigo), senão lead onde a pessoa é coparticipante/cônjuge.

- [ ] **Step 1: Teste que falha**

```ts
import { describe, it, expect } from 'vitest'
import { criarFakeDb } from '@/lib/documentos/__tests__/helpers/fakeDb'
import { leadMaisRecenteDaPessoa } from '../leadDaPessoa'

describe('leadMaisRecenteDaPessoa', () => {
  it('titular: lead onde é pessoa_id', async () => {
    const db = criarFakeDb({ leads: [{ id: 'l1', empresa_id: 'e1', pessoa_id: 'heitor', deleted_at: null }], participacoes: [] })
    expect(await leadMaisRecenteDaPessoa(db as never, 'e1', 'heitor')).toBe('l1')
  })
  it('coparticipante: lead via participação', async () => {
    const db = criarFakeDb({
      leads: [{ id: 'l1', empresa_id: 'e1', pessoa_id: 'heitor', deleted_at: null }],
      participacoes: [{ empresa_id: 'e1', lead_id: 'l1', pessoa_id: 'afranio', papel: 'coparticipante' }],
    })
    expect(await leadMaisRecenteDaPessoa(db as never, 'e1', 'afranio')).toBe('l1')
  })
  it('vendedor não conta como lead dele', async () => {
    const db = criarFakeDb({ leads: [], participacoes: [{ empresa_id: 'e1', lead_id: 'l1', pessoa_id: 'v', papel: 'vendedor' }] })
    expect(await leadMaisRecenteDaPessoa(db as never, 'e1', 'v')).toBeNull()
  })
})
```

Run: `npx vitest run --exclude ".claude/**" --exclude "output/**" src/lib/participantes/__tests__/leadDaPessoa.test.ts` → FAIL (módulo não existe).

- [ ] **Step 2: Implementar**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'

/** Lead mais recente da Pessoa: onde ela é titular; senão, onde é coparticipante/cônjuge (V2). */
export async function leadMaisRecenteDaPessoa(sb: SupabaseClient, empresaId: string, pessoaId: string): Promise<string | null> {
  const { data: comoTitular, error } = await sb.from('leads').select('id')
    .eq('empresa_id', empresaId).eq('pessoa_id', pessoaId).is('deleted_at', null)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (error) throw new Error(`leads: ${error.message}`)
  if (comoTitular) return comoTitular.id as string

  const { data: part, error: eP } = await sb.from('participacoes')
    .select('lead_id, lead:leads!lead_id!inner(deleted_at)')
    .eq('empresa_id', empresaId).eq('pessoa_id', pessoaId)
    .in('papel', ['coparticipante', 'conjuge_anuente'])
    .not('lead_id', 'is', null).is('lead.deleted_at', null)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (eP) throw new Error(`participacoes: ${eP.message}`)
  return (part?.lead_id as string | undefined) ?? null
}
```

- [ ] **Step 3: Usar em `buscarEntidade`**

Em `fonti-comandos.ts`, nos dois pontos que fazem `.from('leads').select('id').eq('empresa_id', empresa_id).eq('pessoa_id', <pessoa>.id)...maybeSingle()` (ramo fromMe ~linha 795 e fim da função ~linha 898), trocar a query por:

```ts
    const leadId = await leadMaisRecenteDaPessoa(supabase, empresa_id, escolhido.id) // no ramo fromMe: pessoa.id
```

e usar `lead_id: leadId ?? undefined` no objeto retornado. Import: `import { leadMaisRecenteDaPessoa } from '@/lib/participantes/leadDaPessoa'`. Rodar `grep -n "\.eq('pessoa_id'" src/lib/bot/fonti-comandos.ts` e aplicar a mesma troca em qualquer outro ponto que busque "lead da pessoa escolhida" para `*salva` (não trocar buscas por `leads.pessoa_id` usadas para outra coisa, como `buscarLeadAbertoPorPessoa` do `*cria cliente`).

- [ ] **Step 4: Rodar testes do bot e do módulo**

Run: `npx vitest run --exclude ".claude/**" --exclude "output/**" src/lib/participantes src/lib/bot` → PASS (as 4 falhas conhecidas de `main`, se aparecerem, não são desta task — comparar com `git stash` se houver dúvida).

- [ ] **Step 5: Commit**

```bash
git add src/lib/participantes/leadDaPessoa.ts src/lib/participantes/__tests__/leadDaPessoa.test.ts src/lib/bot/fonti-comandos.ts
git commit -m "feat(fonti): *salva acha o lead de quem é coparticipante ou cônjuge"
```

---

### Task 11: Documentação e fechamento da Fase A

**Files:**
- Modify: `CLAUDE.md` (nova seção "Participantes V2 — Fase A")
- Modify: `docs/superpowers/specs/2026-09-28-participantes-v2-design.md` (Status)

- [ ] **Step 1: CLAUDE.md**

Acrescentar ao final:

```markdown
## Participantes V2 — Fase A (modelo novo em paralelo, sincronizado do antigo)

Spec: `docs/superpowers/specs/2026-09-28-participantes-v2-design.md`. `participacoes` (Pessoa × lead/processo
com papel) e `pessoa_relacionamentos` (casal) são preenchidas SÓ pelas funções `pv2_*` (migrations 326/327),
chamadas por triggers nas tabelas antigas (`leads`, `lead_coparticipantes`, `lead_vendedores`,
`processo_compradores`, `processo_vendedores`, `pessoas`). Na Fase A:
- **Escrita continua no modelo antigo.** Nunca gravar direto em `participacoes`/`pessoa_relacionamentos`
  (não há policy de escrita; service role gravando por fora desincroniza).
- **Formulários, renda do Crédito, vínculos/destinos de documento e `*salva` já leem do modelo novo**
  (`src/lib/participantes/`). Código novo que precise de "quem participa desta proposta" usa
  `carregarParticipantes()`/`useParticipantes()`, nunca `conjuge_*`/`lead_coparticipantes`/`processo_compradores`.
- Cônjuge em campos soltos vira Pessoa automaticamente (sync); CPF inválido é descartado (`cpf_valido`).
- Pessoa de operador é ignorada pela sync e recusada pelo trigger `trg_participacao_guard`.
- Renda: fonte é a Pessoa; editar renda no lead (tela antiga) propaga para a Pessoa via `fn_pv2_leads`.
```

- [ ] **Step 2: Spec**

Trocar a linha `**Status:**` por `**Status:** Fase A implementada (PR #<número>); Fase B pendente de plano próprio`.

- [ ] **Step 3: Suíte completa e typecheck**

Run: `npx vitest run --exclude ".claude/**" --exclude "output/**"` → só as 4 falhas pré-existentes de `main`.
Run: `npm run typecheck` e `npm run lint` → sem erro novo.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md docs/superpowers/specs/2026-09-28-participantes-v2-design.md
git commit -m "docs: participantes V2 fase A no CLAUDE.md"
```

---

## Depois da Fase A

Plano separado (Fase B), escrito quando esta estiver em produção: `ParticipantesProposta` (aba Pessoa/Negócio), rotas `/api/participacoes/*` e `/api/relacionamentos/*`, OCR "De quem é este documento?", certidão de casamento → Relacionamento, "Mover para participante", conversão lead → negócio pelas participações, migração dos ~20 leitores restantes, desligar sync, `leads.pessoa_id` derivado, colunas antigas → `_legado`.
