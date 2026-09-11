# Comissão Apurada Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Comissão Apurada" sub-aba to Financeiro → Análise de Comissões — pick a comercial from a dropdown and see their monthly closing: production (financing weighted by bank rate + contracts + assessoria), the tier percentage already configured in RH → Comissões, the calculated commission, and the final amount after subtracting that comercial's summed "CGI 1%" manual entries.

**Architecture:** One new SQL function (`comissao_apurada_mes`) that computes its own display sub-aggregates (counts, raw sums) but delegates the tier/piso/teto lookup entirely to the already-existing `calcular_producao_comercial_mes` (migration 240) — no duplication of that logic. One new React Query hook. A third sub-aba added to the existing `AbaAnaliseComissoes.tsx` shell, reusing the already-existing `useMembrosAtivos` hook for the comercial picker.

**Tech Stack:** Next.js 14 (App Router), React Query (`@tanstack/react-query`), Supabase (Postgres + PostgREST + RPC), Tailwind, shadcn/ui components (`Select`, `Table`... actually no table here, just cards).

**Spec:** `docs/superpowers/specs/2026-09-11-comissao-apurada-design.md`

## Global Constraints

- Money values format via `formatarMoeda` from `@/lib/utils` — never hand-roll currency formatting.
- Every Supabase RPC using `RETURNS TABLE` MUST qualify every column reference with a table alias, including inside guard/EXISTS clauses and any subquery — unqualified references collide with the implicit PL/pgSQL variables Postgres creates for the return columns (hit this exact bug in migration 292's `analise_comissoes_mes`, first run). This function additionally calls another `RETURNS TABLE` function (`calcular_producao_comercial_mes`) via `SELECT * INTO a_record_variable` — make sure the record variable's name does not collide with any of the new function's own RETURNS TABLE column names either.
- Migrations are never run by the agent — only written. The user runs them manually in the Supabase SQL Editor.
- Migrations created inside a worktree must also be copied to the main checkout's `supabase/migrations/` immediately, per this project's `CLAUDE.md` — do not skip this even though the branch will eventually merge it there anyway; the user runs it from the main checkout's VSCode window before merge.
- This codebase does not unit-test Supabase-backed UI/RPC features — verification here is `npx tsc --noEmit -p .` after every task, plus one final manual-browser-verification task with concrete pass/fail criteria.
- Git workflow: one feature branch for this whole plan, small commits per task, single PR opened and squash-merged only after the final task passes.
- Do NOT modify `calcular_producao_comercial_mes` or `comissao_comercial_calculada` — this plan only adds a new function that calls the former as-is.

---

### Task 0: Create the feature branch (in an isolated worktree)

**Files:** none (git only)

- [ ] **Step 1: Set up an isolated worktree and branch**

Follow the `superpowers:using-git-worktrees` skill (or the native `EnterWorktree` tool if available) to get an isolated workspace, then create the feature branch inside it:

```bash
git checkout -b feat/comissao-apurada
```

Expected: a clean worktree on a new branch forked from an up-to-date `main`, with `node_modules` installed (`npm install` if the worktree doesn't share them) so `npx tsc --noEmit -p .` can run in later tasks.

---

### Task 1: Migration — `comissao_apurada_mes`

**Files:**
- Create: `supabase/migrations/20260911_294_comissao_apurada.sql`

**Interfaces:**
- Consumes: the existing function `calcular_producao_comercial_mes(p_empresa_id UUID, p_comercial_usuario_id UUID, p_mes INTEGER, p_ano INTEGER) RETURNS TABLE (producao_total NUMERIC, pct_aplicado NUMERIC, comissao_total NUMERIC, regra_id UUID, funcionario_id UUID)` — defined in `supabase/migrations/20260804_240_fix_camada_taxa_banco_comercial.sql:24-139`. Do not modify that file or that function.
- Produces: Postgres function `comissao_apurada_mes(p_empresa_id UUID, p_comercial_usuario_id UUID, p_mes INTEGER, p_ano INTEGER)` returning exactly one row per call with columns `qtd_processos_financiamento, qtd_contratos, valor_financiamento, comissao_financiamento, valor_assessoria, valor_contratos, subtotal, pct_aplicado, comissao_calculada, cgi_manual_total, comissao_apurada` — this exact column list/order is what Task 3's hook and Task 4's UI consume.

- [ ] **Step 1: Write the migration file**

```sql
-- Aba Financeiro > Análise de Comissões > Comissão Apurada: fechamento
-- mensal por comercial. Reaproveita calcular_producao_comercial_mes
-- (RH > Comissões, migration 240) pra faixa/piso/teto — não duplica essa
-- lógica, só chama a função existente e expõe os componentes pra exibição.
-- Desconta a soma do campo cgi_manual (já existente, aba Financiamento —
-- migration 292) dos processos de financiamento do comercial no período.

CREATE OR REPLACE FUNCTION comissao_apurada_mes(
  p_empresa_id            UUID,
  p_comercial_usuario_id  UUID,
  p_mes                   INTEGER,
  p_ano                   INTEGER
)
RETURNS TABLE (
  qtd_processos_financiamento INTEGER,
  qtd_contratos                INTEGER,
  valor_financiamento          NUMERIC,
  comissao_financiamento       NUMERIC,
  valor_assessoria             NUMERIC,
  valor_contratos               NUMERIC,
  subtotal                     NUMERIC,
  pct_aplicado                 NUMERIC,
  comissao_calculada           NUMERIC,
  cgi_manual_total             NUMERIC,
  comissao_apurada             NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_qtd_financiamento      INTEGER;
  v_qtd_contratos          INTEGER;
  v_valor_financiamento    NUMERIC;
  v_comissao_financiamento NUMERIC;
  v_valor_assessoria       NUMERIC;
  v_valor_contratos        NUMERIC;
  v_subtotal               NUMERIC;
  v_cgi_manual_total       NUMERIC;
  v_producao               RECORD;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.empresa_id = p_empresa_id AND u.ativo = true
  ) THEN
    RAISE EXCEPTION 'Acesso negado: empresa_id inválido para este usuário';
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE p.modalidade NOT IN ('Contrato', 'Consorcio')),
    COUNT(*) FILTER (WHERE p.modalidade = 'Contrato'),
    COALESCE(SUM(p.valor_financiado) FILTER (WHERE p.modalidade NOT IN ('Contrato', 'Consorcio')), 0),
    COALESCE(SUM(p.valor_financiado * COALESCE(cp.comissao_comercial, 0) / 100)
             FILTER (WHERE p.modalidade NOT IN ('Contrato', 'Consorcio')), 0),
    COALESCE(SUM(p.valor_assessoria), 0),
    COALESCE(SUM(p.valor_contrato) FILTER (WHERE p.modalidade = 'Contrato'), 0),
    COALESCE(SUM(p.cgi_manual) FILTER (WHERE p.modalidade NOT IN ('Contrato', 'Consorcio')), 0)
  INTO
    v_qtd_financiamento,
    v_qtd_contratos,
    v_valor_financiamento,
    v_comissao_financiamento,
    v_valor_assessoria,
    v_valor_contratos,
    v_cgi_manual_total
  FROM processos p
  LEFT JOIN LATERAL (
    SELECT x.comissao_comercial FROM comissoes_padrao x
    WHERE x.banco_id = p.banco_id AND x.empresa_id = p.empresa_id
      AND (x.modalidade = '' OR x.modalidade = p.modalidade::TEXT)
    ORDER BY (x.modalidade <> '') DESC
    LIMIT 1
  ) cp ON true
  WHERE p.empresa_id = p_empresa_id
    AND p.comercial_id = p_comercial_usuario_id
    AND p.status_emissao = 'emitido'
    AND p.modalidade <> 'Consorcio'
    AND p.data_emissao IS NOT NULL
    AND EXTRACT(MONTH FROM p.data_emissao) = p_mes
    AND EXTRACT(YEAR  FROM p.data_emissao) = p_ano;

  v_subtotal := v_comissao_financiamento + v_valor_assessoria + v_valor_contratos;

  SELECT * INTO v_producao
  FROM calcular_producao_comercial_mes(p_empresa_id, p_comercial_usuario_id, p_mes, p_ano);

  RETURN QUERY SELECT
    v_qtd_financiamento,
    v_qtd_contratos,
    v_valor_financiamento,
    v_comissao_financiamento,
    v_valor_assessoria,
    v_valor_contratos,
    v_subtotal,
    v_producao.pct_aplicado,
    v_producao.comissao_total,
    v_cgi_manual_total,
    v_producao.comissao_total - v_cgi_manual_total;
END;
$$;

GRANT EXECUTE ON FUNCTION comissao_apurada_mes(UUID, UUID, INTEGER, INTEGER) TO authenticated;
```

- [ ] **Step 2: Self-review the SQL for the qualification rule**

Read the function body back and confirm every bare column reference is
prefixed by a table alias (`p.`, `u.`, `cp.`) or is a `v_`-prefixed local
variable — there must be no reference like `WHERE id = ...` anywhere,
including inside the `IF NOT EXISTS` guard and the `LATERAL` subquery.
Also confirm the local `v_producao` RECORD variable name does not match
any of this function's own RETURNS TABLE column names (it doesn't —
those are `qtd_processos_financiamento`, `qtd_contratos`,
`valor_financiamento`, `comissao_financiamento`, `valor_assessoria`,
`valor_contratos`, `subtotal`, `pct_aplicado`, `comissao_calculada`,
`cgi_manual_total`, `comissao_apurada` — none of which is `v_producao`).

- [ ] **Step 3: Copy the migration to the main repo checkout**

If working in a worktree (per Task 0), copy the migration file to the
main checkout's `supabase/migrations/` directory too, so it's visible in
the user's VSCode Explorer before merge (project convention, see
`CLAUDE.md`). Tell the user this migration needs to be run manually in
the Supabase SQL Editor before Task 5 (manual browser verification) can
pass.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260911_294_comissao_apurada.sql
git commit -m "$(cat <<'EOF'
feat: migration da aba Comissão Apurada em Análise de Comissões

Nova função comissao_apurada_mes, que reaproveita a função já existente
calcular_producao_comercial_mes (RH > Comissões, migration 240) pra
faixa/piso/teto — não duplica essa lógica.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Types

**Files:**
- Modify: `src/types/financeiro.ts`

**Interfaces:**
- Produces: `FinComissaoApurada` — the exact shape Task 3's hook returns and Task 4's UI renders.

- [ ] **Step 1: Add `FinComissaoApurada` to `src/types/financeiro.ts`**

Add this right after the existing `FinAnaliseComissaoContratoLinha` interface (search for `export interface FinAnaliseComissaoContratoLinha` to find the spot — it's immediately followed by `export interface FinContaReceber`):

```ts
export interface FinComissaoApurada {
  qtd_processos_financiamento: number
  qtd_contratos: number
  valor_financiamento: number
  comissao_financiamento: number
  valor_assessoria: number
  valor_contratos: number
  subtotal: number
  pct_aplicado: number
  comissao_calculada: number
  cgi_manual_total: number
  comissao_apurada: number
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit -p .
```

Expected: no errors (pure additive type change, nothing consumes it yet).

- [ ] **Step 3: Commit**

```bash
git add src/types/financeiro.ts
git commit -m "$(cat <<'EOF'
feat: tipo FinComissaoApurada

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Hook `useComissaoApuradaMes`

**Files:**
- Modify: `src/hooks/financeiro/useAnaliseComissoes.ts`

**Interfaces:**
- Consumes: `FinComissaoApurada` (Task 2), RPC `comissao_apurada_mes` (Task 1 — not live yet, but the hook code doesn't need it live to typecheck).
- Produces: `useComissaoApuradaMes(comercialId: string | null, mes: number, ano: number): UseQueryResult<FinComissaoApurada | null>` — this exact name and signature is what Task 4 imports. Note the first parameter is nullable and the query is disabled when it's null — this is the mechanism the picker in Task 4 uses to show a placeholder before any comercial is chosen.

- [ ] **Step 1: Add the import and the hook**

Change the type import line at the top of the file from:

```ts
import { type FinAnaliseComissaoLinha, type FinAnaliseComissaoContratoLinha } from '@/types/financeiro'
```

to:

```ts
import { type FinAnaliseComissaoLinha, type FinAnaliseComissaoContratoLinha, type FinComissaoApurada } from '@/types/financeiro'
```

Then add this new function at the end of the file (after `useAnaliseComissoesContratosMes`):

```ts
export function useComissaoApuradaMes(comercialId: string | null, mes: number, ano: number) {
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['financeiro', 'comissao_apurada', usuario?.empresa_id, comercialId, mes, ano],
    queryFn: async (): Promise<FinComissaoApurada | null> => {
      const { data, error } = await supabase.rpc('comissao_apurada_mes', {
        p_empresa_id: usuario!.empresa_id,
        p_comercial_usuario_id: comercialId,
        p_mes: mes,
        p_ano: ano,
      })
      if (error) throw error
      return data?.[0] ?? null
    },
    enabled: !!usuario && !!comercialId,
  })
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit -p .
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/financeiro/useAnaliseComissoes.ts
git commit -m "$(cat <<'EOF'
feat: hook useComissaoApuradaMes

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Terceira sub-aba "Comissão Apurada"

**Files:**
- Modify: `src/components/financeiro/AbaAnaliseComissoes.tsx`

**Interfaces:**
- Consumes: `useComissaoApuradaMes` (Task 3), `FinComissaoApurada` (Task 2), the existing `useMembrosAtivos()` from `@/hooks/dashboard/useDashboard` (already used elsewhere in this codebase, e.g. `src/components/processos/BlocoResponsaveis.tsx` — returns `{ id: string; nome: string; ativo: boolean }[]`), the existing shadcn `Select`/`SelectContent`/`SelectItem`/`SelectTrigger`/`SelectValue` from `@/components/ui/select`.
- Produces: nothing consumed by other tasks — this is the final UI piece.

- [ ] **Step 1: Add the new imports**

At the top of the file, add two new import statements (after the existing `import { Search } from 'lucide-react'` line) and extend the existing hooks/types imports:

```ts
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useMembrosAtivos } from '@/hooks/dashboard/useDashboard'
```

Note: `FinComissaoApurada` (Task 2) does not need to be imported by name in
this file — it's only ever used as the inferred return type of
`useComissaoApuradaMes`, never referenced directly. Do not add it to the
existing types import block.

Change the hooks import block from:

```ts
import {
  useAnaliseComissoesMes,
  useAtualizarCgiManual,
  useAnaliseComissoesContratosMes,
} from '@/hooks/financeiro/useAnaliseComissoes'
```

to:

```ts
import {
  useAnaliseComissoesMes,
  useAtualizarCgiManual,
  useAnaliseComissoesContratosMes,
  useComissaoApuradaMes,
} from '@/hooks/financeiro/useAnaliseComissoes'
```

- [ ] **Step 2: Add the third sub-aba button**

Change the `SubAba` type from:

```ts
type SubAba = 'financiamento' | 'contratos'
```

to:

```ts
type SubAba = 'financiamento' | 'contratos' | 'comissao_apurada'
```

Then, in the `AbaAnaliseComissoes` component's JSX, right after the existing "Contratos" button (find `Contratos\n        </button>` inside the `flex gap-1 rounded-lg bg-gray-100` div) and before its closing `</div>`, add a third button:

```tsx
        <button
          onClick={() => setSubAba('comissao_apurada')}
          className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
            subAba === 'comissao_apurada' ? 'bg-white text-fonti-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Comissão Apurada
        </button>
```

Then change the ternary that picks which view to render from:

```tsx
      {subAba === 'financiamento'
        ? <VisaoAnaliseComissoesFinanciamento mes={mes} ano={ano} />
        : <VisaoAnaliseComissoesContratos mes={mes} ano={ano} />}
```

to:

```tsx
      {subAba === 'financiamento'
        ? <VisaoAnaliseComissoesFinanciamento mes={mes} ano={ano} />
        : subAba === 'contratos'
        ? <VisaoAnaliseComissoesContratos mes={mes} ano={ano} />
        : <VisaoComissaoApurada mes={mes} ano={ano} />}
```

- [ ] **Step 3: Add the `VisaoComissaoApurada` component**

Add this new function at the end of the file (after `VisaoAnaliseComissoesContratos`):

```tsx
function VisaoComissaoApurada({ mes, ano }: Props) {
  const { data: membros = [] } = useMembrosAtivos()
  const [comercialId, setComercialId] = useState<string>('')
  const { data, isLoading } = useComissaoApuradaMes(comercialId || null, mes, ano)

  return (
    <div className="space-y-4">
      <div className="max-w-xs">
        <label className="text-xs text-gray-500 mb-1 block">Comercial</label>
        <Select value={comercialId} onValueChange={setComercialId}>
          <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione um comercial" /></SelectTrigger>
          <SelectContent>
            {membros.map(m => <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {!comercialId ? (
        <p className="text-sm text-gray-400">Selecione um comercial para ver o fechamento apurado.</p>
      ) : isLoading ? (
        <p className="text-sm text-gray-400">Carregando...</p>
      ) : !data ? (
        <p className="text-sm text-gray-400">Nenhum dado encontrado para este comercial no período.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border bg-white p-3">
            <p className="text-xs text-gray-500">Processos Financiamento</p>
            <p className="text-lg font-semibold text-fonti-primary">{data.qtd_processos_financiamento}</p>
          </div>
          <div className="rounded-lg border bg-white p-3">
            <p className="text-xs text-gray-500">Contratos</p>
            <p className="text-lg font-semibold text-fonti-primary">{data.qtd_contratos}</p>
          </div>
          <div className="rounded-lg border bg-white p-3">
            <p className="text-xs text-gray-500">Valor Financiamento</p>
            <p className="text-lg font-semibold text-fonti-primary">{formatarMoeda(data.valor_financiamento)}</p>
          </div>
          <div className="rounded-lg border bg-white p-3">
            <p className="text-xs text-gray-500">Comissão</p>
            <p className="text-lg font-semibold text-fonti-primary">{formatarMoeda(data.comissao_financiamento)}</p>
          </div>
          <div className="rounded-lg border bg-white p-3">
            <p className="text-xs text-gray-500">Assessoria</p>
            <p className="text-lg font-semibold text-fonti-primary">{formatarMoeda(data.valor_assessoria)}</p>
          </div>
          <div className="rounded-lg border bg-white p-3">
            <p className="text-xs text-gray-500">Valor Contratos</p>
            <p className="text-lg font-semibold text-fonti-primary">{formatarMoeda(data.valor_contratos)}</p>
          </div>
          <div className="rounded-lg border bg-white p-3">
            <p className="text-xs text-gray-500">Subtotal</p>
            <p className="text-lg font-semibold text-fonti-primary">{formatarMoeda(data.subtotal)}</p>
          </div>
          <div className="rounded-lg border bg-white p-3">
            <p className="text-xs text-gray-500">% Aplicado</p>
            <p className="text-lg font-semibold text-fonti-primary">{data.pct_aplicado.toFixed(2)}%</p>
          </div>
          <div className="rounded-lg border bg-white p-3">
            <p className="text-xs text-gray-500">Cálculo de Comissões</p>
            <p className="text-lg font-semibold text-fonti-primary">{formatarMoeda(data.comissao_calculada)}</p>
          </div>
          <div className="rounded-lg border bg-white p-3">
            <p className="text-xs text-gray-500">CGI 1%</p>
            <p className="text-lg font-semibold text-fonti-primary">{formatarMoeda(data.cgi_manual_total)}</p>
          </div>
          <div className="rounded-lg border bg-fonti-accent-hover p-3 sm:col-span-2">
            <p className="text-xs text-gray-500">Comissão Apurada</p>
            <p className="text-xl font-bold text-green-700">{formatarMoeda(data.comissao_apurada)}</p>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit -p .
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/financeiro/AbaAnaliseComissoes.tsx
git commit -m "$(cat <<'EOF'
feat: sub-aba Comissão Apurada em Financeiro > Análise de Comissões

Seletor de comercial + fechamento apurado do mês (produção, % de faixa
já configurado em RH > Comissões, cálculo, CGI 1% descontado).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Push, PR, merge, and manual browser verification

**Files:** none (git + manual QA)

**Interfaces:**
- Consumes: everything from Tasks 1-4.

- [ ] **Step 1: Push the branch and open the PR**

```bash
git push -u origin feat/comissao-apurada
gh pr create --base main --head feat/comissao-apurada \
  --title "feat: aba Comissão Apurada em Financeiro > Análise de Comissões" \
  --body "$(cat <<'EOF'
## Summary
- Terceira sub-aba de Análise de Comissões: seletor de comercial + fechamento apurado do mês.
- Reaproveita a função já existente calcular_producao_comercial_mes (RH > Comissões, migration 240) pra faixa/piso/teto — sem duplicar essa lógica.
- Desconta a soma do campo CGI 1% (já existente na aba Financiamento) do comercial no período.

Spec: docs/superpowers/specs/2026-09-11-comissao-apurada-design.md

## Test plan
- [x] tsc --noEmit sem erros em cada task
- [ ] Migration rodada pelo usuário no Supabase
- [ ] Verificação manual no navegador (ver checklist abaixo)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 2: Ask the user to run the migration**

Say explicitly: the file `supabase/migrations/20260911_294_comissao_apurada.sql`
needs to be run in the Supabase SQL Editor before the checklist below can
be verified. Wait for confirmation before continuing to Step 3.

- [ ] **Step 3: Manual browser verification**

Start the dev server (`npm run dev`), log in, and check every item:

1. Go to Financeiro > Análise de Comissões — confirm a third sub-aba
   "Comissão Apurada" appears next to "Financiamento" and "Contratos".
2. Click it with no comercial selected — confirm the placeholder message
   "Selecione um comercial para ver o fechamento apurado." shows and no
   error appears in the console.
3. Pick a comercial who has at least one financing processo emitted in
   the current month — confirm the cards populate with non-zero
   `Processos Financiamento`, `Valor Financiamento`, `Comissão`.
4. Manually compute `comissao_financiamento` by hand for that comercial's
   processos (valor_financiado × comissoes_padrao.comissao_comercial for
   their bank/modalidade) and confirm it matches the "Comissão" card.
5. Compare `% Aplicado` and `Cálculo de Comissões` against what RH >
   Comissões / Comissões a Pagar already shows for the same
   comercial/month — they must match exactly (same underlying function).
6. If that comercial has any processo with a CGI 1% value filled in on
   the Financiamento sub-aba, confirm `CGI 1%` here equals the sum of
   those values, and `Comissão Apurada` = `Cálculo de Comissões` − that sum.
7. Switch to a different comercial in the dropdown — confirm all numbers
   change accordingly (no stale data from the previous selection).
8. Switch back to the "Financiamento" and "Contratos" sub-abas — confirm
   both still work exactly as before this plan (no regression).

If any item fails, stop and report which one — do not proceed to
merging with a known-failing item.

- [ ] **Step 4: Merge**

```bash
gh pr merge <PR_NUMBER> --squash --delete-branch
git checkout main --quiet
git pull --ff-only origin main
```
