# Participantes V2 — Fase B2a (dados pessoais e comunicação) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Pessoa passa a ser a única fonte de e-mail, telefone, estado civil e conta bancária de quem participa de um negócio, e a comunicação com comprador passa a ser por participação — tudo com a sincronização da Fase A ainda ligada, sem mudar quem grava "quem participa".

**Architecture:** Hoje a inclusão de comprador/vendedor pela aba do Negócio grava e-mail/telefone só na linha antiga (`processo_compradores`/`processo_vendedores`), e três leitores (Clicksign, e-mail de confirmação, formulários) e a comunicação com comprador ainda leem essas linhas. A migration 329 faz o trigger da Fase A copiar esses dados para a Pessoa (só preenche vazio, nunca sobrescreve) e preenche o que já existe; a 330 liga `comunicacao_relacionamentos` à participação. Depois disso os leitores passam para Pessoa/participação e o overlay de `formularios/dados.ts` sai. Roteiro completo da B2: `2026-09-30-participantes-v2-fase-b2-roteiro.md`.

**Tech Stack:** Next.js 14 (App Router), supabase-js 2.103, React Query, Vitest, PostgreSQL (Supabase; SQL rodado manualmente pelo usuário).

**Spec:** `docs/superpowers/specs/2026-09-28-participantes-v2-design.md` (seção 1 "Participação nunca copia dado da Pessoa"; seção 4 formulários/contratos; seção 6 Fase B).

## Global Constraints

- Worktree `.claude/worktrees/participantes-v2`, branch `feat/participantes-v2-fase-b2a` (de `main` @ e6be4e9). Nunca tocar no checkout principal, exceto para copiar os `.sql` na entrega; nunca `git stash`; push/PR só na entrega.
- Nenhuma escrita de **quem participa** muda (nenhum insert/delete novo em `lead_coparticipantes`, `lead_vendedores`, `processo_compradores`, `processo_vendedores`, `participacoes`, `pessoa_relacionamentos` fora das funções SQL `pv2_*`).
- Cópia para a Pessoa **só preenche campo vazio** (nunca sobrescreve) e **nunca** toca Pessoa de operador (`pessoa_e_de_operador`) nem grava telefone de usuário interno numa Pessoa de cliente (invariante 1 do CLAUDE.md).
- Toda query em `pessoas` filtra `deleted_at IS NULL`; toda consulta supabase-js olha `error`.
- Migrations: `supabase/migrations/20261004_329_participantes_v2_contato_na_pessoa.sql`, `supabase/migrations/20261004_330_participantes_v2_comunicacao_por_participacao.sql`; diagnóstico `supabase/2026-10-04_diagnostico_contato_linhas_antigas.sql`. Agentes não rodam SQL (sem banco local): revisão estática; o usuário roda. **Ordem de lançamento: diagnóstico → 329 → 330 (fora do horário) → só depois merge do código** (formulários sem overlay e comunicação por participação dependem delas).
- Testes TS: `node ../../../node_modules/vitest/vitest.mjs run --dir src --exclude ".claude/**" --exclude "output/**" <arquivo>`. Falhas pré-existentes: `src/app/api/leads/[id]/atualizar-cliente/__tests__/route.test.ts`, `src/lib/simuladorFinanciamento/__tests__/criteria-migracao-fase4-caixa.test.ts`, `src/lib/workflows/__tests__/mensagem-imovel-acima-teto.test.ts`, `src/lib/workflows/__tests__/prazo-idade-renda-maxima.test.ts` (o de `processos/[id]/atualizar-cliente` passa a funcionar na Task 5).
- Tipos: `node ../../../node_modules/typescript/bin/tsc --noEmit -p .` (ignorar `output/`).
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Linha antiga com dado diferente do da Pessoa** (ex.: e-mail digitado na inclusão do comprador ≠ e-mail que a Pessoa já tinha) → a Pessoa vence (preenchimento só de vazio); o diagnóstico lista todas as divergências antes da 329 para o usuário decidir caso a caso. Formulário muda de valor nesses casos — intencional e visível no diagnóstico.
2. **Telefone da linha antiga que já pertence a outra Pessoa ativa** (UNIQUE `(empresa_id, telefone) WHERE ativo`) → não grava, não quebra a transação (`ON CONFLICT DO NOTHING`).
3. **Telefone de comercial digitado como telefone de comprador** → nunca vai para a Pessoa do cliente.
4. **Envio de comunicação com a lista de interessados aberta antes do deploy** (tela com `interessado_id` antigo = id de `processo_compradores`) → a rota aceita o id antigo e resolve para a participação da mesma Pessoa.
5. **Negócio sem titular** (Pessoa excluída/operador) → Clicksign/e-mail de confirmação respondem a mensagem de erro já existente ("Comprador principal sem nome ou e-mail"), sem 500.

---

### Task 1: Migration 329 — dados das linhas antigas vão para a Pessoa + diagnóstico

**Files:**
- Create: `supabase/2026-10-04_diagnostico_contato_linhas_antigas.sql`
- Create: `supabase/migrations/20261004_329_participantes_v2_contato_na_pessoa.sql`

**Interfaces:**
- Consumes: `pessoa_e_de_operador(uuid)`, `telefone_canonico_br(text)`, `fn_pv2_processo_filhos()` e flag `pv2.backfill` (migration 327).
- Produces: função `pv2_copiar_contato_linhas_antigas(p_processo_id uuid) → void`; `fn_pv2_processo_filhos` passa a chamá-la depois de `pv2_sincronizar_processo`.

- [ ] **Step 1: Diagnóstico (só leitura)**

`supabase/2026-10-04_diagnostico_contato_linhas_antigas.sql`:

```sql
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
```

- [ ] **Step 2: Migration 329**

`supabase/migrations/20261004_329_participantes_v2_contato_na_pessoa.sql`:

```sql
-- ============================================================
-- Migration 329: Participantes V2 — B2a: dados de contato das linhas antigas vão para a Pessoa
-- A aba do Negócio (useAdicionarComprador/useAdicionarVendedor) ainda grava e-mail/telefone/
-- estado civil só em processo_compradores/processo_vendedores. O trigger da Fase A passa a
-- copiar esses dados para a Pessoa depois de sincronizar o processo — SÓ PREENCHE campo vazio,
-- nunca sobrescreve; nunca toca Pessoa de operador; nunca grava telefone de usuário interno
-- numa Pessoa de cliente (invariante 1 do CLAUDE.md). Conta bancária do vendedor já é copiada
-- por pv2_sincronizar_processo (326).
-- Rodar ANTES o diagnóstico supabase/2026-10-04_diagnostico_contato_linhas_antigas.sql.
-- Rodar fora do horário comercial: o backfill mexe em pessoas.updated_at (formulários abertos
-- da AbaPessoa recarregam).
-- ============================================================
BEGIN;

CREATE OR REPLACE FUNCTION pv2_copiar_contato_linhas_antigas(p_processo_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_email text; v_estado text; v_tel text; v_empresa uuid;
BEGIN
  FOR r IN
    SELECT pc.pessoa_id, pc.email, pc.telefone, NULL::text AS estado_civil, pc.created_at
    FROM processo_compradores pc WHERE pc.processo_id = p_processo_id AND pc.pessoa_id IS NOT NULL
    UNION ALL
    SELECT pv.pessoa_id, pv.email, pv.telefone, pv.estado_civil, pv.created_at
    FROM processo_vendedores pv WHERE pv.processo_id = p_processo_id AND pv.pessoa_id IS NOT NULL
    ORDER BY 5
  LOOP
    SELECT empresa_id INTO v_empresa FROM pessoas WHERE id = r.pessoa_id AND deleted_at IS NULL;
    CONTINUE WHEN v_empresa IS NULL OR pessoa_e_de_operador(r.pessoa_id);

    v_email  := nullif(trim(r.email), '');
    IF v_email IS NOT NULL AND v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN v_email := NULL; END IF;
    v_estado := lower(nullif(trim(r.estado_civil), ''));
    IF v_estado NOT IN ('solteiro', 'casado', 'uniao_estavel', 'divorciado', 'viuvo') THEN v_estado := NULL; END IF;

    UPDATE pessoas SET
      email        = coalesce(email, v_email),
      estado_civil = coalesce(estado_civil, v_estado)
    WHERE id = r.pessoa_id
      AND ((email IS NULL AND v_email IS NOT NULL) OR (estado_civil IS NULL AND v_estado IS NOT NULL));

    v_tel := nullif(trim(r.telefone), '');
    IF v_tel IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pessoa_telefones t WHERE t.pessoa_id = r.pessoa_id AND t.ativo)
       AND NOT EXISTS (
         SELECT 1 FROM usuarios u
         WHERE u.empresa_id = v_empresa AND u.ativo
           AND ((u.telefone_whatsapp IS NOT NULL AND telefone_canonico_br(u.telefone_whatsapp) = telefone_canonico_br(v_tel))
             OR (u.telefone IS NOT NULL AND telefone_canonico_br(u.telefone) = telefone_canonico_br(v_tel)))
       ) THEN
      INSERT INTO pessoa_telefones (pessoa_id, empresa_id, telefone, principal, whatsapp, ativo)
      VALUES (r.pessoa_id, v_empresa, v_tel, true, true, true)
      ON CONFLICT (empresa_id, telefone) WHERE ativo = true DO NOTHING;
    END IF;
  END LOOP;
END $$;
REVOKE EXECUTE ON FUNCTION pv2_copiar_contato_linhas_antigas(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION pv2_copiar_contato_linhas_antigas(uuid) TO service_role;

-- Mesma função da 327 + a cópia de contato depois da sincronização.
CREATE OR REPLACE FUNCTION fn_pv2_processo_filhos() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NULL; END IF;
  IF current_setting('pv2.backfill', true) = 'on' THEN RETURN NULL; END IF;
  IF TG_OP = 'DELETE' THEN
    PERFORM pv2_sincronizar_processo(OLD.processo_id);
  ELSE
    PERFORM pv2_sincronizar_processo(NEW.processo_id);
    PERFORM pv2_copiar_contato_linhas_antigas(NEW.processo_id);
    IF TG_OP = 'UPDATE' AND OLD.processo_id IS DISTINCT FROM NEW.processo_id THEN
      PERFORM pv2_sincronizar_processo(OLD.processo_id);
    END IF;
  END IF;
  RETURN NULL;
END $$;

-- Backfill: triggers pv2 desligados (a cópia não precisa re-sincronizar nada).
SELECT set_config('pv2.backfill', 'on', true);
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM processos WHERE deleted_at IS NULL ORDER BY created_at LOOP
    PERFORM pv2_copiar_contato_linhas_antigas(r.id);
  END LOOP;
END $$;
SELECT set_config('pv2.backfill', 'off', true);

COMMIT;
```

- [ ] **Step 3: Revisão estática**

Confirmar (e anotar no relatório da task):
- `diff` do corpo de `fn_pv2_processo_filhos` contra `supabase/migrations/20261002_327_participantes_v2_triggers_backfill.sql` → a única diferença é a linha `PERFORM pv2_copiar_contato_linhas_antigas(NEW.processo_id);`.
- `pessoas.estado_civil` tem CHECK com os 5 valores usados no `IN (...)` (`grep -n "estado_civil TEXT CHECK" supabase/migrations/*.sql`).
- O índice `idx_pessoa_telefones_lookup` é `(empresa_id, telefone) WHERE ativo = true` (migration `20260507_024_pessoas.sql:50`) — o `ON CONFLICT` usa exatamente esse alvo.
- `pessoa_telefones` tem as colunas `pessoa_id, empresa_id, telefone, principal, whatsapp, ativo` (mesmo INSERT de `atualizar_telefone_pessoa`, migration 304).

- [ ] **Step 4: Commit**

```bash
git add supabase/2026-10-04_diagnostico_contato_linhas_antigas.sql supabase/migrations/20261004_329_participantes_v2_contato_na_pessoa.sql
git commit -m "feat(participantes): e-mail/telefone/estado civil das linhas antigas vão para a Pessoa (V2 B2a, migration 329)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Conta bancária editada no vendedor vai para a Pessoa

**Files:**
- Modify: `src/hooks/processos/useProcessoVendedores.ts:143-150` (bloco "Sincronizar campos compartilhados com pessoas" de `useEditarVendedor`)

**Interfaces:**
- Consumes: `ProcessoVendedor` (`src/types/processos.ts`, campos `banco`, `agencia`, `conta`).
- Produces: nada novo.

Motivo: a Task 6 tira o overlay de `formularios/dados.ts`, que hoje faz a conta bancária digitada na aba Vendedores vencer a da Pessoa. A sincronização (326) só copia conta bancária quando a Pessoa não tem; uma **edição** posterior da conta do vendedor precisa ir para a Pessoa, como já acontece com nome/CPF/e-mail/estado civil.

- [ ] **Step 1: Implementar**

Em `useEditarVendedor`, logo depois de

```ts
        if (input.conjuge_data_nasc !== undefined) pessoaPayload.conjuge_data_nascimento = input.conjuge_data_nasc || null
```

acrescentar:

```ts
        // Conta bancária: Pessoa é a fonte dos formulários (V2 B2a) — edição aqui precisa chegar lá.
        if (input.banco   !== undefined) pessoaPayload.conta_bancaria_banco   = input.banco || null
        if (input.agencia !== undefined) pessoaPayload.conta_bancaria_agencia = input.agencia || null
        if (input.conta   !== undefined) pessoaPayload.conta_bancaria_numero  = input.conta || null
```

E trocar

```ts
          await supabase.from('pessoas').update(pessoaPayload).eq('id', resolvedPessoaId)
```

(dentro de `useEditarVendedor`) por

```ts
          const { error: errPessoa } = await supabase.from('pessoas').update(pessoaPayload).eq('id', resolvedPessoaId)
          if (errPessoa) throw errPessoa
```

- [ ] **Step 2: Verificar**

Run: `node ../../../node_modules/typescript/bin/tsc --noEmit -p . 2>&1 | grep -v "^output/"` → sem erros (`conta_bancaria_*` não precisam de tipo: `pessoaPayload` é `Record<string, unknown>`).

- [ ] **Step 3: Commit**

```bash
git add src/hooks/processos/useProcessoVendedores.ts
git commit -m "fix(participantes): conta bancária editada no vendedor vai para a Pessoa (V2 B2a)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Contato do titular e telefone principal

**Files:**
- Modify: `src/lib/participantes/consultas.ts` (`TitularProposta` + `titularDaProposta` devolvem `email`)
- Create: `src/lib/participantes/contato.ts`
- Modify: `src/lib/participantes/__tests__/consultas.test.ts`
- Create: `src/lib/participantes/__tests__/contato.test.ts`

**Interfaces:**
- Produces:
  - `interface TitularProposta { pessoa_id: string; nome: string; cpf: string | null; email: string | null }`
  - `telefonePrincipalAtivo(tels: Array<{ telefone: string | null; principal: boolean | null; ativo: boolean | null }> | null | undefined): string | null`

- [ ] **Step 1: Testes (vão falhar)**

`src/lib/participantes/__tests__/contato.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { telefonePrincipalAtivo } from '../contato'

describe('telefonePrincipalAtivo', () => {
  it('principal ativo; senão o 1º ativo; inativo nunca; vazio → null', () => {
    expect(telefonePrincipalAtivo([
      { telefone: '1', principal: false, ativo: true },
      { telefone: '2', principal: true, ativo: true },
    ])).toBe('2')
    expect(telefonePrincipalAtivo([
      { telefone: '9', principal: true, ativo: false },
      { telefone: '3', principal: false, ativo: true },
    ])).toBe('3')
    expect(telefonePrincipalAtivo([{ telefone: '9', principal: true, ativo: false }])).toBeNull()
    expect(telefonePrincipalAtivo([{ telefone: '  ', principal: true, ativo: true }])).toBeNull()
    expect(telefonePrincipalAtivo(null)).toBeNull()
  })
})
```

Em `src/lib/participantes/__tests__/consultas.test.ts`, na fixture de `pessoas`, trocar a linha do Heitor por
`{ id: 'h', nome: 'Heitor', cpf: '52998224725', email: 'heitor@x.com', deleted_at: null },`
e a expectativa do teste `'Pessoa do titular'` por:

```ts
      .toEqual({ pessoa_id: 'h', nome: 'Heitor', cpf: '52998224725', email: 'heitor@x.com' })
```

Run: `node ../../../node_modules/vitest/vitest.mjs run --dir src --exclude ".claude/**" --exclude "output/**" src/lib/participantes`
Expected: FAIL (`../contato` não existe; `email` ausente no titular).

- [ ] **Step 2: Implementar**

`src/lib/participantes/contato.ts`:

```ts
type Telefone = { telefone: string | null; principal: boolean | null; ativo: boolean | null }

/** Telefone principal ativo da Pessoa (pessoa_telefones); sem principal, o 1º ativo. */
export function telefonePrincipalAtivo(tels: Telefone[] | null | undefined): string | null {
  const ativos = (tels ?? []).filter(t => t.ativo && t.telefone?.trim())
  return (ativos.find(t => t.principal) ?? ativos[0])?.telefone?.trim() ?? null
}
```

Em `src/lib/participantes/consultas.ts`:
- `export interface TitularProposta { pessoa_id: string; nome: string; cpf: string | null; email: string | null }`
- no `select` da Pessoa: `'id, nome, cpf, email'`
- no cast: `const pe = pessoa as { id: string; nome: string | null; cpf: string | null; email: string | null }`
- no retorno: `return { pessoa_id: pe.id, nome: pe.nome ?? '', cpf: pe.cpf ?? null, email: pe.email ?? null }`

Conferir com `grep -rn "titularDaProposta" src --include=*.ts --include=*.tsx` que nenhum chamador desestrutura o retorno de forma que quebre (todos leem `pessoa_id`/`nome`).

- [ ] **Step 3: Rodar**

Run: o comando do Step 1 → PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/participantes/contato.ts src/lib/participantes/consultas.ts src/lib/participantes/__tests__/contato.test.ts src/lib/participantes/__tests__/consultas.test.ts
git commit -m "feat(participantes): e-mail do titular e telefone principal ativo (V2 B2a)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Clicksign e e-mail de confirmação de valores leem o titular

**Files:**
- Modify: `src/app/api/clicksign/enviar/route.ts:74-88`
- Modify: `src/app/api/clicksign/__tests__/enviar.test.ts` (fake do `supabaseAdmin`)
- Modify: `src/app/api/processos/[id]/emails/confirmacao-valores/preview/route.ts:40-70`

**Interfaces:**
- Consumes (Task 3): `titularDaProposta(sb, { tipo: 'processo', id }) → { pessoa_id, nome, cpf, email } | null`.

- [ ] **Step 1: Ajustar o fake do teste do Clicksign (vai falhar)**

Em `src/app/api/clicksign/__tests__/enviar.test.ts`, no proxy do `supabaseAdmin`:
- acrescentar `is: () => proxy,` junto de `select/or/eq/update`;
- no `maybeSingle`, trocar
  `if (tabela === 'processo_compradores') return { data: fakeState.comprador, error: null }`
  por:

```ts
          if (tabela === 'participacoes') return { data: fakeState.comprador ? { pessoa_id: 'pessoa-1' } : null, error: null }
          if (tabela === 'pessoas') return { data: fakeState.comprador ? { id: 'pessoa-1', cpf: null, ...fakeState.comprador } : null, error: null }
```

Run: `node ../../../node_modules/vitest/vitest.mjs run --dir src --exclude ".claude/**" --exclude "output/**" src/app/api/clicksign`
Expected: FAIL nos testes que esperam envio com o comprador (a rota ainda consulta `processo_compradores`, que agora devolve `null`).

- [ ] **Step 2: Clicksign**

Em `src/app/api/clicksign/enviar/route.ts`, trocar o bloco que começa em `// Comprador principal resolvido no servidor` até o `if (!comprador?.nome || !comprador?.email) {` por:

```ts
    // Titular da proposta resolvido no servidor (V2: participações + Pessoa) —
    // nome/e-mail do signatário nunca vêm do body.
    let comprador: { nome: string; email: string | null } | null = null
    try {
      const titular = await titularDaProposta(supabaseAdmin, { tipo: 'processo', id: contrato.processo_id })
      comprador = titular ? { nome: titular.nome, email: titular.email } : null
    } catch (e) {
      console.error('[clicksign/enviar] titular:', e)
      return NextResponse.json({ error: 'Erro ao identificar o comprador principal.' }, { status: 500 })
    }

    if (!comprador?.nome || !comprador?.email) {
```

(o resto do `if` — mensagem "Comprador principal sem nome ou e-mail cadastrado..." — fica igual.) Import: `import { titularDaProposta } from '@/lib/participantes/consultas'`. Conferir que o restante da rota só usa `comprador.nome`/`comprador.email`.

Run o teste do Step 1 → PASS.

- [ ] **Step 3: E-mail de confirmação de valores**

Em `src/app/api/processos/[id]/emails/confirmacao-valores/preview/route.ts`:
- remover a linha `compradores:processo_compradores(nome, email, principal)` do `select` (e a vírgula que sobrar na linha anterior: `banco:bancos!banco_id(id, nome)`);
- trocar

```ts
    const compradorPrincipal = (processo.compradores as any[])?.find((c: any) => c.principal)
      ?? (processo.compradores as any[])?.[0]
    const paraEmail: string = compradorPrincipal?.email ?? ''
```

por

```ts
    // V2: e-mail do titular da proposta (Pessoa). Sem titular → campo vazio na prévia (como antes sem comprador).
    let paraEmail = ''
    try {
      paraEmail = (await titularDaProposta(supabaseAdmin, { tipo: 'processo', id: processo.id }))?.email ?? ''
    } catch (e) {
      console.error('[confirmacao-valores/preview] titular:', e)
    }
```

Import `titularDaProposta`. Conferir com `grep -n "compradorPrincipal\|processo.compradores" "src/app/api/processos/[id]/emails/confirmacao-valores/preview/route.ts"` → nenhum uso restante.

- [ ] **Step 4: Verificar**

Run: `node ../../../node_modules/typescript/bin/tsc --noEmit -p . 2>&1 | grep -v "^output/"` → sem erros.
Run: suíte completa → só as falhas pré-existentes.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/clicksign/enviar/route.ts src/app/api/clicksign/__tests__/enviar.test.ts "src/app/api/processos/[id]/emails/confirmacao-valores/preview/route.ts"
git commit -m "feat(participantes): Clicksign e e-mail de confirmação usam o titular (V2 B2a)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Comunicação com comprador por participação (migration 330 + rotas)

**Files:**
- Create: `supabase/migrations/20261004_330_participantes_v2_comunicacao_por_participacao.sql`
- Modify: `src/app/api/processos/[id]/interessados/route.ts:43-56`
- Modify: `src/app/api/processos/[id]/interessados/__tests__/route.test.ts`
- Modify: `src/app/api/processos/[id]/atualizar-cliente/route.ts:14-17,86-102`
- Modify: `src/app/api/processos/[id]/atualizar-cliente/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `PAPEIS_COMPRA` (`@/lib/participantes/tipos`), `telefonePrincipalAtivo` (Task 3).
- Produces: `interessado_id` de comprador = `participacoes.id`; coluna `comunicacao_relacionamentos.participacao_id`.

- [ ] **Step 1: Migration 330**

`supabase/migrations/20261004_330_participantes_v2_comunicacao_por_participacao.sql`:

```sql
-- ============================================================
-- Migration 330: Participantes V2 — B2a: comunicação com comprador por participação
-- comunicacao_relacionamentos (cliente em Negócio) era identificado por processo_compradores.id.
-- Passa a ter participacao_id (participação de compra: titular/coparticipante/cônjuge anuente).
-- Linhas existentes ganham participacao_id (mesma Pessoa no mesmo processo) e mantêm
-- processo_comprador_id até a B3. ATENÇÃO B3: processo_comprador_id é ON DELETE CASCADE —
-- zerar antes de apagar processo_compradores, senão o histórico de comunicação some junto.
-- ============================================================
BEGIN;

ALTER TABLE comunicacao_relacionamentos
  ADD COLUMN IF NOT EXISTS participacao_id UUID REFERENCES participacoes(id) ON DELETE CASCADE;

-- Mesma forma da migration 173; cliente em Negócio aceita processo_comprador_id OU participacao_id,
-- e todas as outras formas exigem participacao_id nulo.
ALTER TABLE comunicacao_relacionamentos DROP CONSTRAINT IF EXISTS chk_comunicacao_relacionamentos_forma;
ALTER TABLE comunicacao_relacionamentos
  ADD CONSTRAINT chk_comunicacao_relacionamentos_forma CHECK (
    (papel = 'cliente' AND lead_id IS NOT NULL AND processo_id IS NULL
      AND processo_comprador_id IS NULL AND participacao_id IS NULL AND lead_corretor_id IS NULL AND processo_corretor_id IS NULL
      AND lead_parceiro_id IS NULL AND lead_imobiliaria_id IS NULL
      AND processo_parceiro_id IS NULL AND processo_imobiliaria_id IS NULL)
    OR (papel = 'cliente' AND processo_id IS NOT NULL AND lead_id IS NULL
      AND (processo_comprador_id IS NOT NULL OR participacao_id IS NOT NULL)
      AND lead_corretor_id IS NULL AND processo_corretor_id IS NULL
      AND lead_parceiro_id IS NULL AND lead_imobiliaria_id IS NULL
      AND processo_parceiro_id IS NULL AND processo_imobiliaria_id IS NULL)
    OR (papel = 'corretor' AND lead_id IS NOT NULL AND processo_id IS NULL
      AND lead_corretor_id IS NOT NULL AND processo_comprador_id IS NULL AND participacao_id IS NULL AND processo_corretor_id IS NULL
      AND lead_parceiro_id IS NULL AND lead_imobiliaria_id IS NULL
      AND processo_parceiro_id IS NULL AND processo_imobiliaria_id IS NULL)
    OR (papel = 'corretor' AND processo_id IS NOT NULL AND lead_id IS NULL
      AND processo_corretor_id IS NOT NULL AND processo_comprador_id IS NULL AND participacao_id IS NULL AND lead_corretor_id IS NULL
      AND lead_parceiro_id IS NULL AND lead_imobiliaria_id IS NULL
      AND processo_parceiro_id IS NULL AND processo_imobiliaria_id IS NULL)
    OR (papel = 'parceiro' AND lead_id IS NOT NULL AND lead_parceiro_id IS NOT NULL
      AND processo_id IS NULL AND processo_comprador_id IS NULL AND participacao_id IS NULL AND lead_corretor_id IS NULL
      AND processo_corretor_id IS NULL AND lead_imobiliaria_id IS NULL
      AND processo_parceiro_id IS NULL AND processo_imobiliaria_id IS NULL)
    OR (papel IN ('imobiliaria', 'construtora') AND lead_id IS NOT NULL AND lead_imobiliaria_id IS NOT NULL
      AND processo_id IS NULL AND processo_comprador_id IS NULL AND participacao_id IS NULL AND lead_corretor_id IS NULL
      AND processo_corretor_id IS NULL AND lead_parceiro_id IS NULL
      AND processo_parceiro_id IS NULL AND processo_imobiliaria_id IS NULL)
    OR (papel = 'parceiro' AND processo_id IS NOT NULL AND processo_parceiro_id IS NOT NULL
      AND lead_id IS NULL AND processo_comprador_id IS NULL AND participacao_id IS NULL AND lead_corretor_id IS NULL
      AND processo_corretor_id IS NULL AND lead_parceiro_id IS NULL AND lead_imobiliaria_id IS NULL
      AND processo_imobiliaria_id IS NULL)
    OR (papel IN ('imobiliaria', 'construtora') AND processo_id IS NOT NULL AND processo_imobiliaria_id IS NOT NULL
      AND lead_id IS NULL AND processo_comprador_id IS NULL AND participacao_id IS NULL AND lead_corretor_id IS NULL
      AND processo_corretor_id IS NULL AND lead_parceiro_id IS NULL AND lead_imobiliaria_id IS NULL
      AND processo_parceiro_id IS NULL)
  );

CREATE UNIQUE INDEX IF NOT EXISTS uq_comrel_cliente_participacao
  ON comunicacao_relacionamentos(participacao_id) WHERE papel = 'cliente' AND participacao_id IS NOT NULL;

-- Validação: participacao_id tem que ser participação de COMPRA do mesmo processo.
-- Resto: cópia literal de fn_validar_comunicacao_relacionamento (migration 173).
CREATE OR REPLACE FUNCTION fn_validar_comunicacao_relacionamento()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.papel = 'cliente' AND NEW.processo_id IS NOT NULL THEN
    IF NEW.participacao_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM participacoes
        WHERE id = NEW.participacao_id AND processo_id = NEW.processo_id
          AND papel IN ('titular', 'coparticipante', 'conjuge_anuente')
      ) THEN
        RAISE EXCEPTION 'participacao_id % nao e participacao de compra do processo_id %', NEW.participacao_id, NEW.processo_id;
      END IF;
    END IF;
    IF NEW.processo_comprador_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM processo_compradores
        WHERE id = NEW.processo_comprador_id AND processo_id = NEW.processo_id
      ) THEN
        RAISE EXCEPTION 'processo_comprador_id % nao pertence ao processo_id %', NEW.processo_comprador_id, NEW.processo_id;
      END IF;
    END IF;
  ELSIF NEW.papel = 'corretor' AND NEW.lead_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM lead_corretores WHERE id = NEW.lead_corretor_id AND lead_id = NEW.lead_id) THEN
      RAISE EXCEPTION 'lead_corretor_id % nao pertence ao lead_id %', NEW.lead_corretor_id, NEW.lead_id;
    END IF;
  ELSIF NEW.papel = 'corretor' AND NEW.processo_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM processo_corretores WHERE id = NEW.processo_corretor_id AND processo_id = NEW.processo_id) THEN
      RAISE EXCEPTION 'processo_corretor_id % nao pertence ao processo_id %', NEW.processo_corretor_id, NEW.processo_id;
    END IF;
  ELSIF NEW.papel = 'parceiro' AND NEW.lead_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM lead_parceiros WHERE id = NEW.lead_parceiro_id AND lead_id = NEW.lead_id) THEN
      RAISE EXCEPTION 'lead_parceiro_id % nao pertence ao lead_id %', NEW.lead_parceiro_id, NEW.lead_id;
    END IF;
  ELSIF NEW.papel = 'parceiro' AND NEW.processo_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM processo_parceiros WHERE id = NEW.processo_parceiro_id AND processo_id = NEW.processo_id) THEN
      RAISE EXCEPTION 'processo_parceiro_id % nao pertence ao processo_id %', NEW.processo_parceiro_id, NEW.processo_id;
    END IF;
  ELSIF NEW.papel IN ('imobiliaria', 'construtora') AND NEW.lead_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM lead_imobiliarias WHERE id = NEW.lead_imobiliaria_id AND lead_id = NEW.lead_id AND papel = NEW.papel) THEN
      RAISE EXCEPTION 'lead_imobiliaria_id % nao pertence ao lead_id % com papel %', NEW.lead_imobiliaria_id, NEW.lead_id, NEW.papel;
    END IF;
  ELSIF NEW.papel IN ('imobiliaria', 'construtora') AND NEW.processo_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM processo_imobiliarias WHERE id = NEW.processo_imobiliaria_id AND processo_id = NEW.processo_id AND papel = NEW.papel) THEN
      RAISE EXCEPTION 'processo_imobiliaria_id % nao pertence ao processo_id % com papel %', NEW.processo_imobiliaria_id, NEW.processo_id, NEW.papel;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Relacionamento de comunicação nasce com a participação de compra (como nascia com processo_compradores).
CREATE OR REPLACE FUNCTION fn_criar_comrel_participacao() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.processo_id IS NOT NULL AND NEW.papel IN ('titular', 'coparticipante', 'conjuge_anuente') THEN
    INSERT INTO comunicacao_relacionamentos (empresa_id, papel, processo_id, participacao_id)
    VALUES (NEW.empresa_id, 'cliente', NEW.processo_id, NEW.id)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_comrel_criar_participacao ON participacoes;
CREATE TRIGGER trg_comrel_criar_participacao
  AFTER INSERT OR UPDATE OF papel ON participacoes
  FOR EACH ROW EXECUTE FUNCTION fn_criar_comrel_participacao();

-- Backfill 1: linhas existentes (por processo_compradores) ganham a participação da mesma Pessoa.
-- DISTINCT ON: duas linhas antigas da mesma Pessoa no mesmo processo → só a mais antiga recebe.
WITH alvo AS (
  SELECT DISTINCT ON (pa.id) cr.id AS comrel_id, pa.id AS participacao_id
  FROM comunicacao_relacionamentos cr
  JOIN processo_compradores pc ON pc.id = cr.processo_comprador_id
  JOIN participacoes pa ON pa.processo_id = pc.processo_id AND pa.pessoa_id = pc.pessoa_id
   AND pa.papel IN ('titular', 'coparticipante', 'conjuge_anuente')
  WHERE cr.papel = 'cliente' AND cr.participacao_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM comunicacao_relacionamentos x WHERE x.participacao_id = pa.id)
  ORDER BY pa.id, cr.criado_em
)
UPDATE comunicacao_relacionamentos cr SET participacao_id = alvo.participacao_id
FROM alvo WHERE cr.id = alvo.comrel_id;

-- Backfill 2: participação de compra sem relacionamento (ex.: cônjuge anuente, que nunca esteve em processo_compradores).
INSERT INTO comunicacao_relacionamentos (empresa_id, papel, processo_id, participacao_id)
SELECT pa.empresa_id, 'cliente', pa.processo_id, pa.id
FROM participacoes pa
WHERE pa.processo_id IS NOT NULL AND pa.papel IN ('titular', 'coparticipante', 'conjuge_anuente')
ON CONFLICT DO NOTHING;

COMMIT;
```

Revisão estática (anotar no relatório): as 8 formas do CHECK são as mesmas da migration `20260719_173` com `participacao_id` acrescentado; `fn_validar_comunicacao_relacionamento` difere da versão da 173 só no ramo `cliente` + processo; `grep -n "criado_em" supabase/migrations/20260717_167_comunicacao_relacionamentos.sql` confirma a coluna usada no `ORDER BY`.

- [ ] **Step 2: Testes das rotas (vão falhar)**

`src/app/api/processos/[id]/interessados/__tests__/route.test.ts`:
- trocar a fixture `compradores` por participações (mesmos ids, para as expectativas continuarem valendo):

```ts
  compradores: [
    { id: 'comprador-1', papel: 'titular', ordem: 1, pessoa: { id: 'pe-1', nome: 'Comprador Ativo', deleted_at: null, pessoa_telefones: [{ telefone: '5511900000000', principal: true, ativo: true }] } },
    { id: 'comprador-2', papel: 'coparticipante', ordem: 2, pessoa: { id: 'pe-2', nome: 'Comprador Sem Telefone', deleted_at: null, pessoa_telefones: [] } },
  ] as Array<{ id: string; papel: string; ordem: number; pessoa: { id: string; nome: string; deleted_at: null; pessoa_telefones: Array<{ telefone: string; principal: boolean; ativo: boolean }> } }>,
```

- trocar o bloco `if (tabela === 'processo_compradores') { ... }` por:

```ts
      if (tabela === 'participacoes') {
        return { select: () => ({ eq: () => ({ in: () => ({ is: async () => ({ data: fakeState.compradores, error: null }) }) }) }) }
      }
```

`src/app/api/processos/[id]/atualizar-cliente/__tests__/route.test.ts`:
- no objeto `client` do fake (irmão de `auth` e `from`), acrescentar:
  `rpc: async (_nome: string, _args: unknown) => ({ data: 'conversa-nova-1', error: null }),`
  (a rota resolve a conversa por `resolverOuCriarConversa` → RPC `obter_ou_criar_conversa`; o fake não tinha `rpc`, por isso os 7 testes já falhavam antes desta task);
- no `maybeSingle`, trocar o ramo `if (tabela === 'processo_compradores') { ... }` por:

```ts
          if (tabela === 'participacoes') {
            if (!fakeState.compradorExiste) return { data: null, error: null }
            return {
              data: {
                id: 'comprador-1',
                pessoa: {
                  id: 'pessoa-1', nome: 'Comprador Teste', deleted_at: null,
                  pessoa_telefones: fakeState.compradorTelefone ? [{ telefone: fakeState.compradorTelefone, principal: true, ativo: true }] : [],
                },
              },
              error: null,
            }
          }
          if (tabela === 'processo_compradores') return { data: null, error: null } // id antigo não reconhecido
```

Run: `node ../../../node_modules/vitest/vitest.mjs run --dir src --exclude ".claude/**" --exclude "output/**" "src/app/api/processos/[id]/interessados" "src/app/api/processos/[id]/atualizar-cliente"`
Expected: FAIL — interessados sem comprador (rota ainda lê `processo_compradores`); atualizar-cliente "Comprador não encontrado" (404).

- [ ] **Step 3: Rota de interessados**

Em `src/app/api/processos/[id]/interessados/route.ts`, trocar o trecho de `const { data: compradores } = await supabaseService` até o fim do `for (const comprador of compradores ?? [])` por:

```ts
  // V2: compradores = participações de compra (titular, coparticipante, cônjuge anuente);
  // nome e telefone sempre da Pessoa. interessado_id = id da participação.
  const { data: compradores, error: erroCompradores } = await supabaseService
    .from('participacoes')
    .select('id, papel, ordem, pessoa:pessoas!pessoa_id!inner(id, nome, deleted_at, pessoa_telefones(telefone, principal, ativo))')
    .eq('processo_id', processoId)
    .in('papel', [...PAPEIS_COMPRA])
    .is('pessoa.deleted_at', null)
  if (erroCompradores) return NextResponse.json({ error: 'Erro ao carregar os compradores.' }, { status: 500 })

  const ordenados = [...(compradores ?? [])].sort((a, b) =>
    (a.papel === 'titular' ? 0 : 1) - (b.papel === 'titular' ? 0 : 1) || a.ordem - b.ordem)
  for (const c of ordenados) {
    const pessoa = Array.isArray(c.pessoa) ? c.pessoa[0] : c.pessoa
    if (!pessoa) continue
    const telefone = telefonePrincipalAtivo(pessoa.pessoa_telefones)
    interessados.push({
      tipo_interessado: 'comprador',
      interessado_id: c.id,
      nome: pessoa.nome,
      apto: !!telefone,
      motivo_indisponibilidade: telefone ? null : 'Telefone não cadastrado',
    })
  }
```

Imports: `import { PAPEIS_COMPRA } from '@/lib/participantes/tipos'` e `import { telefonePrincipalAtivo } from '@/lib/participantes/contato'`. Atualizar o comentário do topo da rota: "comprador(es)" = participações de compra.

- [ ] **Step 4: Rota de atualizar-cliente (comprador)**

Em `src/app/api/processos/[id]/atualizar-cliente/route.ts`:
- `type ColunaIdentidadeProcesso = 'participacao_id' | 'processo_comprador_id' | 'processo_corretor_id' | 'processo_parceiro_id' | 'processo_imobiliaria_id'`
- trocar o ramo `if (tipo_interessado === 'comprador') { ... }` (da consulta a `processo_compradores` até o `destinatario = { ... }` inclusive) por:

```ts
  if (tipo_interessado === 'comprador') {
    // V2: interessado_id é a participação de compra. Compatibilidade com a lista aberta antes
    // do deploy da B2a: um id de processo_compradores é traduzido para a participação da mesma Pessoa.
    const SELECT_PART = 'id, pessoa:pessoas!pessoa_id!inner(id, nome, deleted_at, pessoa_telefones(telefone, principal, ativo))'
    let { data: part } = await supabaseService
      .from('participacoes')
      .select(SELECT_PART)
      .eq('id', interessado_id)
      .eq('processo_id', processoId)
      .in('papel', [...PAPEIS_COMPRA])
      .is('pessoa.deleted_at', null)
      .maybeSingle()
    if (!part) {
      const { data: antigo } = await supabaseService
        .from('processo_compradores')
        .select('pessoa_id')
        .eq('id', interessado_id)
        .eq('processo_id', processoId)
        .maybeSingle()
      if (antigo?.pessoa_id) {
        ;({ data: part } = await supabaseService
          .from('participacoes')
          .select(SELECT_PART)
          .eq('processo_id', processoId)
          .eq('pessoa_id', antigo.pessoa_id)
          .in('papel', [...PAPEIS_COMPRA])
          .is('pessoa.deleted_at', null)
          .maybeSingle())
      }
    }
    const pessoa = part ? (Array.isArray(part.pessoa) ? part.pessoa[0] : part.pessoa) : null
    if (!part || !pessoa) {
      return NextResponse.json({ error: 'Comprador não encontrado para este Negócio.' }, { status: 404 })
    }
    const telefone = telefonePrincipalAtivo(pessoa.pessoa_telefones)
    if (!telefone) {
      return NextResponse.json({ error: 'Este comprador não tem telefone cadastrado.' }, { status: 422 })
    }
    destinatario = {
      nome: pessoa.nome, telefone, pessoaId: pessoa.id,
      papelRelacionamento: 'cliente', colunaIdentidade: 'participacao_id', valorIdentidade: part.id,
    }
```

(o `} else if (tipo_interessado === 'corretor') {` seguinte fica igual.) Mesmos dois imports da Step 3.

- [ ] **Step 5: Rodar**

Run: o comando do Step 2 → PASS em `interessados`; em `processos/[id]/atualizar-cliente` todos os testes passam (inclusive os 7 que falhavam antes por falta de `rpc` no fake). Se algum teste de comprador ainda falhar por conteúdo esperado em `escritas` (ex.: `processo_comprador_id` num insert de `comunicacao_relacionamentos`), trocar a expectativa para `participacao_id` — é a mudança de comportamento desta task.
Run: `node ../../../node_modules/typescript/bin/tsc --noEmit -p . 2>&1 | grep -v "^output/"` → sem erros.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261004_330_participantes_v2_comunicacao_por_participacao.sql "src/app/api/processos/[id]/interessados" "src/app/api/processos/[id]/atualizar-cliente"
git commit -m "feat(participantes): comunicação com comprador por participação (V2 B2a, migration 330)

Também corrige o fake do teste de atualizar-cliente (faltava rpc), que falhava desde antes.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Formulários sem o overlay das linhas antigas

**Files:**
- Modify: `src/lib/formularios/dados.ts:108-160` (remove `LinhaAntiga`, `sobreporCamposAntigos` e as consultas a `processo_compradores`/`processo_vendedores`)
- Modify: `src/lib/formularios/__tests__/dados-processo.test.ts:40-91`

**Interfaces:**
- Consumes: `carregarParticipantes`, `montarCompradores`, `montarVendedores` (Fase A) — `email`, `telefone` (principal ativo), `estado_civil`, `banco/agencia/conta` (`conta_bancaria_*`), `conjuge_nome/cpf` (Relacionamento) já vêm da Pessoa.

- [ ] **Step 1: Teste (vai falhar)**

Em `src/lib/formularios/__tests__/dados-processo.test.ts`, substituir os testes `'campos não-nulos das linhas antigas vencem os da Pessoa; nulos/vazios não apagam'`, `'linha antiga de outra Pessoa não vaza'`, `'erro em processo_vendedores lança'` e `'erro em processo_compradores lança'` por:

```ts
  it('dados de compradores e vendedores vêm só da Pessoa; linhas antigas são ignoradas', async () => {
    const { buscarDadosFormulario } = await import('../dados')
    const d = await buscarDadosFormulario('p1')

    expect(d.compradores).toHaveLength(1)
    expect(d.compradores[0].email).toBe('heitor@pessoa')
    expect(d.compradores[0].telefone).toBe('44911111111')

    expect(d.vendedores).toHaveLength(1)
    const v = d.vendedores[0]
    expect(v.banco).toBe('Itaú')
    expect(v.agencia).toBe('0001')
    expect(v.conta).toBe('999')
    expect(v.email).toBeNull()
    expect(v.estado_civil).toBe('solteiro')
    expect(v.conjuge_nome).toBeNull()
  })

  it('não consulta as tabelas antigas (erro nelas não afeta o formulário)', async () => {
    estado.erros.processo_compradores = 'não deveria ser lida'
    estado.erros.processo_vendedores = 'não deveria ser lida'
    const { buscarDadosFormulario } = await import('../dados')
    await expect(buscarDadosFormulario('p1')).resolves.toMatchObject({ id: 'p1' })
  })
```

(as fixtures `processo_compradores`/`processo_vendedores` do `beforeEach` ficam — provam que são ignoradas.)

Run: `node ../../../node_modules/vitest/vitest.mjs run --dir src --exclude ".claude/**" --exclude "output/**" src/lib/formularios/__tests__/dados-processo.test.ts`
Expected: FAIL (overlay ainda aplicado; erro nas tabelas antigas ainda lança).

- [ ] **Step 2: Implementar**

Em `src/lib/formularios/dados.ts`:
- apagar `type LinhaAntiga = ...` e a função `sobreporCamposAntigos` inteira (com o comentário acima dela);
- trocar o bloco que começa em `// Fase A: a tela antiga ainda grava email/telefone/conta/estado civil/cônjuge direto em` até a linha `['email', 'telefone', 'estado_civil', 'banco', 'agencia', 'conta', 'conjuge_nome', 'conjuge_cpf'])` inclusive por:

```ts
  // V2 B2a: tudo vem da Pessoa (e o cônjuge, do Relacionamento). E-mail/telefone/estado civil
  // digitados nas linhas antigas são copiados para a Pessoa pela migration 329.
  const compradores = montarCompradores(participantes)
  const vendedores = montarVendedores(participantes)
```

Run: o teste do Step 1 → PASS.
Run: `grep -n "processo_compradores\|processo_vendedores" src/lib/formularios/dados.ts` → nenhuma consulta (só comentários, se houver).

- [ ] **Step 3: Verificar**

Run: `node ../../../node_modules/typescript/bin/tsc --noEmit -p . 2>&1 | grep -v "^output/"` → sem erros.
Run: suíte de `src/lib/formularios` → PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/formularios/dados.ts src/lib/formularios/__tests__/dados-processo.test.ts
git commit -m "feat(participantes): formulários do negócio sem overlay das linhas antigas (V2 B2a)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Página da Pessoa mostra os negócios em que ela participa

**Files:**
- Modify: `src/app/(protected)/pessoas/[id]/page.tsx:338-360` (query `processos-pessoa`)

**Interfaces:**
- Consumes: `processosDaPessoa(sb, empresaId, pessoaId, papeis)` (`@/lib/participantes/consultas`), `PAPEIS_COMPRA`, `PAPEIS_VENDA`.

Hoje a lista usa `processos.pessoa_id` (campo legado) ou o lead da Pessoa — coparticipante, cônjuge e vendedor não veem o negócio na página deles.

- [ ] **Step 1: Implementar**

No `queryFn` de `['processos-pessoa', params.id, leadIds]`, trocar a montagem do filtro

```ts
      const orFilter = leadIds.length > 0
        ? `pessoa_id.eq.${params.id},lead_id.in.(${leadIds.join(',')})`
        : `pessoa_id.eq.${params.id}`
```

por

```ts
      // V2: também os negócios em que a Pessoa é participante (compra ou venda).
      const idsParticipacao = await processosDaPessoa(supabase, usuario!.empresa_id, params.id, [...PAPEIS_COMPRA, ...PAPEIS_VENDA])
      const partes = [`pessoa_id.eq.${params.id}`]
      if (leadIds.length > 0) partes.push(`lead_id.in.(${leadIds.join(',')})`)
      if (idsParticipacao.length > 0) partes.push(`id.in.(${idsParticipacao.join(',')})`)
      const orFilter = partes.join(',')
```

Imports: `import { processosDaPessoa } from '@/lib/participantes/consultas'` e `import { PAPEIS_COMPRA, PAPEIS_VENDA } from '@/lib/participantes/tipos'`. Conferir o nome do cliente Supabase usado no arquivo (`supabase`) e que `usuario` já está disponível nesse escopo (a query tem `enabled: !!usuario?.empresa_id`).

- [ ] **Step 2: Verificar**

Run: `node ../../../node_modules/typescript/bin/tsc --noEmit -p . 2>&1 | grep -v "^output/"` → sem erros.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(protected)/pessoas/[id]/page.tsx"
git commit -m "feat(participantes): página da Pessoa lista negócios em que ela participa (V2 B2a)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: CLAUDE.md + entrega

**Files:**
- Modify: `CLAUDE.md` (seção "Participantes V2 — Fase B1")

- [ ] **Step 1: Atualizar a regra**

Na seção `### Participantes V2 — Fase B1: leitor novo lê participações, nunca as tabelas antigas (2026-10)`, trocar o parágrafo que começa em `**Exceção temporária até a B2:**` por:

```markdown
**B2a (2026-10):** e-mail/telefone/estado civil/conta bancária de participante também vêm só da Pessoa
(Clicksign, e-mail de confirmação, formulários sem overlay). O que a aba do Negócio ainda digita nas linhas
antigas é copiado para a Pessoa pelo trigger (migration 329: só preenche vazio). Comunicação com comprador
é por participação: `interessado_id` = `participacoes.id` e `comunicacao_relacionamentos.participacao_id`
(migration 330). **B3:** `comunicacao_relacionamentos.processo_comprador_id` é `ON DELETE CASCADE` — zerar
antes de apagar `processo_compradores`, senão o histórico de comunicação some.
```

- [ ] **Step 2: Verificação final**

Run: suíte completa → só as falhas pré-existentes (4 arquivos; `processos/[id]/atualizar-cliente` passa).
Run: `tsc` → sem erros.
Run: `grep -rnE "from\('(processo_compradores|processo_vendedores)'\)" src --include=*.ts --include=*.tsx | grep -v __tests__` → só escritores da B2b (hooks/abas de compradores e vendedores, `NovoProcessoModal`, `NovoProcessoRapidoModal`, `AbaPessoa`, `CompletarDadosPessoaDrawer`, página da Pessoa (espelhos de edição), `useEditarLead`, merge de pessoas, `resolver-pessoa`) e o fallback de id antigo em `atualizar-cliente`.

- [ ] **Step 3: Commit + SQL na raiz**

```bash
git add CLAUDE.md
git commit -m "docs(claude-md): regra da B2a dos participantes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Copiar para o checkout principal (sem commit lá): `supabase/migrations/20261004_329_*.sql` e `20261004_330_*.sql` → `supabase/migrations/`; `supabase/2026-10-04_diagnostico_contato_linhas_antigas.sql` → `supabase/`.

- [ ] **Step 4: Entrega**

superpowers:finishing-a-development-branch. PR com a ordem de lançamento: diagnóstico → 329 → 330 (fora do horário) → merge. Merge só depois de o usuário confirmar que rodou as migrations.
