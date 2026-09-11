# Aba Contratos em Análise de Comissões — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Contratos" sub-aba to Financeiro → Análise de Comissões — a monthly statement of paid particular contracts (modalidade `Contrato`), filtered by payment-confirmation date — plus the fields/UI on the Contrato process screen needed to capture that data.

**Architecture:** One new SQL migration (3 columns on `processos` + a `SECURITY DEFINER` RPC mirroring `analise_comissoes_mes`), one new React Query hook, a small "Pagamento" card added to `ContratoConstrutor.tsx` (2 local mutations, same pattern as the existing `useAtualizarTipoValorContrato`), and `AbaAnaliseComissoes.tsx` restructured into 2 sub-abas (existing content untouched, becomes "Financiamento"; new "Contratos" view added).

**Tech Stack:** Next.js 14 (App Router), React Query (`@tanstack/react-query`), Supabase (Postgres + PostgREST + RPC), Tailwind, shadcn/ui components (`Select`, `Input`, `Button`, `Table`).

**Spec:** `docs/superpowers/specs/2026-09-11-aba-contratos-analise-comissoes-design.md`

## Global Constraints

- Money values format via `formatarMoeda` from `@/lib/utils` — never hand-roll currency formatting.
- Date-only fields render via `new Date(x).toLocaleDateString('pt-BR')` — same convention used everywhere else in this codebase (e.g. `AbaEmissoes.tsx`), even though it has a known UTC-parsing quirk on date-only strings. Do not "fix" that quirk here — out of scope.
- Every Supabase RPC using `RETURNS TABLE` MUST qualify every column reference with a table alias, including inside guard/EXISTS clauses and LATERAL subqueries — unqualified references collide with the implicit PL/pgSQL variables Postgres creates for the return columns (hit this exact bug in migration 292, see `analise_comissoes_mes`).
- This codebase does not unit-test Supabase-backed UI/RPC features (grep `src/components/financeiro/*.tsx` — no test files exist for any of the PRs #250-255 that built this same tab). Verification here is `npx tsc --noEmit -p .` after every task, plus one final manual-browser-verification task with concrete pass/fail criteria — do not invent a test framework or test file for this feature.
- Migrations are never run by the agent — only written. The user runs them manually in the Supabase SQL Editor (established project convention, see `CLAUDE.md`). Say so explicitly when a task's migration needs running before the next task can be verified live.
- Git workflow: one feature branch for this whole plan (`feat/aba-contratos-analise-comissoes`), small commits per task, single PR opened and squash-merged only after the final task passes.

---

### Task 0: Create the feature branch

**Files:** none (git only)

- [ ] **Step 1: Create and check out the branch**

```bash
cd "C:\Users\Marci\Downloads\openclau\squads\credifon-crm"
git checkout main
git pull --ff-only origin main
git checkout -b feat/aba-contratos-analise-comissoes
```

Expected: branch created from an up-to-date `main`, no uncommitted changes carried over (check with `git status --short` — only the pre-existing untracked scratch files from earlier sessions should show, nothing from this plan yet).

---

### Task 1: Migration — schema + RPC

**Files:**
- Create: `supabase/migrations/20260911_293_analise_comissoes_contratos.sql`

**Interfaces:**
- Produces: table `processos` gains 3 nullable columns (`financiou BOOLEAN`,
  `prospectado_por TEXT`, `data_pagamento_contrato DATE`); Postgres function
  `analise_comissoes_contratos_mes(p_empresa_id UUID, p_mes INTEGER, p_ano
  INTEGER)` returning one row per paid contract in that month, columns
  `id, processo_id, cliente_nome, cliente_cpf, comercial_nome,
  corretor_nome, imobiliaria_nome, prospectado_por, financiou,
  valor_contrato, data_pagamento_contrato`.

- [ ] **Step 1: Write the migration file**

```sql
-- Aba Financeiro > Análise de Comissões > Contratos: demonstrativo mensal
-- de contratos particulares pagos. O gatilho de mês é
-- data_pagamento_contrato (quando o pagamento foi confirmado na tela do
-- processo), não a data de criação/emissão — um contrato só aparece na
-- aba depois de alguém confirmar o pagamento.

ALTER TABLE processos
  ADD COLUMN IF NOT EXISTS financiou BOOLEAN,
  ADD COLUMN IF NOT EXISTS prospectado_por TEXT CHECK (prospectado_por IN ('fontinhas', 'direto')),
  ADD COLUMN IF NOT EXISTS data_pagamento_contrato DATE;

CREATE OR REPLACE FUNCTION analise_comissoes_contratos_mes(
  p_empresa_id UUID,
  p_mes        INTEGER,
  p_ano        INTEGER
)
RETURNS TABLE (
  id                       UUID,
  processo_id              UUID,
  cliente_nome             TEXT,
  cliente_cpf              TEXT,
  comercial_nome           TEXT,
  corretor_nome            TEXT,
  imobiliaria_nome         TEXT,
  prospectado_por          TEXT,
  financiou                BOOLEAN,
  valor_contrato           NUMERIC,
  data_pagamento_contrato  DATE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.empresa_id = p_empresa_id AND u.ativo = true
  ) THEN
    RAISE EXCEPTION 'Acesso negado: empresa_id inválido para este usuário';
  END IF;

  RETURN QUERY
  SELECT
    p.id                            AS id,
    p.id                            AS processo_id,
    COALESCE(pe.nome, pc.nome, '')  AS cliente_nome,
    COALESCE(pe.cpf, pc.cpf, '')    AS cliente_cpf,
    uc.nome                         AS comercial_nome,
    cor.nome                        AS corretor_nome,
    imob.nome                       AS imobiliaria_nome,
    p.prospectado_por               AS prospectado_por,
    p.financiou                     AS financiou,
    p.valor_contrato                AS valor_contrato,
    p.data_pagamento_contrato       AS data_pagamento_contrato
  FROM processos p
  LEFT JOIN usuarios uc ON uc.id = p.comercial_id
  LEFT JOIN pessoas pe ON pe.id = p.pessoa_id
  LEFT JOIN LATERAL (
    SELECT pcomp.nome, pcomp.cpf FROM processo_compradores pcomp
    WHERE pcomp.processo_id = p.id
    ORDER BY pcomp.principal DESC NULLS LAST LIMIT 1
  ) pc ON true
  LEFT JOIN LATERAL (
    SELECT c.nome FROM processo_corretores pcor
    JOIN corretores c ON c.id = pcor.corretor_id
    WHERE pcor.processo_id = p.id
    ORDER BY pcor.principal DESC NULLS LAST, pcor.criado_em ASC LIMIT 1
  ) cor ON true
  LEFT JOIN LATERAL (
    SELECT i.nome FROM processo_imobiliarias pim
    JOIN imobiliarias i ON i.id = pim.imobiliaria_id
    WHERE pim.processo_id = p.id
    ORDER BY pim.criado_em ASC LIMIT 1
  ) imob ON true
  WHERE p.empresa_id = p_empresa_id
    AND p.modalidade = 'Contrato'
    AND p.data_pagamento_contrato IS NOT NULL
    AND EXTRACT(MONTH FROM p.data_pagamento_contrato) = p_mes
    AND EXTRACT(YEAR  FROM p.data_pagamento_contrato) = p_ano
  ORDER BY p.data_pagamento_contrato DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION analise_comissoes_contratos_mes(UUID, INTEGER, INTEGER) TO authenticated;
```

- [ ] **Step 2: Self-review the SQL for the qualification rule**

Read the function body back and confirm every bare column reference is
prefixed by a table alias (`p.`, `u.`, `pe.`, `pc.`, `cor.`, `imob.`,
`uc.`) — there must be no reference like `WHERE id = ...` or `WHERE
processo_id = ...` without a prefix anywhere in the function, including
inside the `IF NOT EXISTS` guard and every `LATERAL` subquery. This is
the exact class of bug that broke `analise_comissoes_mes` on its first
run (migration 292) — catching it here avoids the two round-trips that
one took.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260911_293_analise_comissoes_contratos.sql
git commit -m "$(cat <<'EOF'
feat: migration da aba Contratos em Análise de Comissões

Colunas financiou/prospectado_por/data_pagamento_contrato em processos +
função analise_comissoes_contratos_mes (mesmo padrão de
analise_comissoes_mes, migration 292).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

Note for the user (say this out loud when this task finishes, don't wait
silently): this migration needs to be run manually in the Supabase SQL
Editor before Task 6 (manual browser verification) can pass — the earlier
tasks (2-5) only need `tsc` to pass and don't touch a live database.

---

### Task 2: Types

**Files:**
- Modify: `src/types/financeiro.ts`
- Modify: `src/types/processos.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `FinAnaliseComissaoContratoLinha` (financeiro.ts) — the exact
  shape Task 3's hook returns and Task 5's table renders. `Processo` gains
  `financiou`, `prospectado_por`, `data_pagamento_contrato` — the exact
  fields Task 4 reads/writes.

- [ ] **Step 1: Add `FinAnaliseComissaoContratoLinha` to `src/types/financeiro.ts`**

Add this right after the existing `FinAnaliseComissaoLinha` interface
(search for `export interface FinAnaliseComissaoLinha` to find the spot):

```ts
export interface FinAnaliseComissaoContratoLinha {
  id: string
  processo_id: string
  cliente_nome: string
  cliente_cpf: string
  comercial_nome: string | null
  corretor_nome: string | null
  imobiliaria_nome: string | null
  prospectado_por: 'fontinhas' | 'direto' | null
  financiou: boolean | null
  valor_contrato: number | null
  data_pagamento_contrato: string | null
}
```

- [ ] **Step 2: Add the 3 new fields to `Processo` in `src/types/processos.ts`**

Find the `// Contrato` comment block (has `tipo_contrato`, `valor_contrato`,
`numero_contrato`, `data_contrato`) and add the 3 new fields right after
`data_contrato`:

```ts
  // Contrato
  tipo_contrato?: TipoContrato | null
  valor_contrato?: number | null
  numero_contrato?: string | null
  data_contrato?: string | null
  // Pagamento do contrato particular (ver aba Financeiro > Análise de
  // Comissões > Contratos) — data_pagamento_contrato é o gatilho de mês:
  // presença dela = pagamento confirmado.
  financiou?: boolean | null
  prospectado_por?: 'fontinhas' | 'direto' | null
  data_pagamento_contrato?: string | null
```

- [ ] **Step 3: Typecheck**

```bash
cd "C:\Users\Marci\Downloads\openclau\squads\credifon-crm"
npx tsc --noEmit -p .
```

Expected: no errors (these are pure additive type changes, nothing
consumes them yet).

- [ ] **Step 4: Commit**

```bash
git add src/types/financeiro.ts src/types/processos.ts
git commit -m "$(cat <<'EOF'
feat: tipos da aba Contratos em Análise de Comissões

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Hook `useAnaliseComissoesContratosMes`

**Files:**
- Modify: `src/hooks/financeiro/useAnaliseComissoes.ts`

**Interfaces:**
- Consumes: `FinAnaliseComissaoContratoLinha` (Task 2), RPC
  `analise_comissoes_contratos_mes` (Task 1 — not live yet, but the hook
  code doesn't need it live to typecheck).
- Produces: `useAnaliseComissoesContratosMes(mes: number, ano: number):
  UseQueryResult<FinAnaliseComissaoContratoLinha[]>` — this exact name and
  signature is what Task 5 imports.

- [ ] **Step 1: Add the import and the hook**

At the top of the file, change the type import line from:

```ts
import { type FinAnaliseComissaoLinha } from '@/types/financeiro'
```

to:

```ts
import { type FinAnaliseComissaoLinha, type FinAnaliseComissaoContratoLinha } from '@/types/financeiro'
```

Then add this new function at the end of the file (after
`useAtualizarCgiManual`):

```ts
export function useAnaliseComissoesContratosMes(mes: number, ano: number) {
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['financeiro', 'analise_comissoes_contratos', usuario?.empresa_id, mes, ano],
    queryFn: async (): Promise<FinAnaliseComissaoContratoLinha[]> => {
      const { data, error } = await supabase.rpc('analise_comissoes_contratos_mes', {
        p_empresa_id: usuario!.empresa_id,
        p_mes: mes,
        p_ano: ano,
      })
      if (error) throw error
      return data ?? []
    },
    enabled: !!usuario,
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
feat: hook useAnaliseComissoesContratosMes

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: "Pagamento" card no Processo de Contrato

**Files:**
- Modify: `src/components/processos/ContratoConstrutor.tsx`

**Interfaces:**
- Consumes: `Processo.financiou`/`prospectado_por`/`data_pagamento_contrato`
  (Task 2).
- Produces: nothing consumed by other tasks — this is a leaf UI change.

- [ ] **Step 1: Add the 3 new icons to the lucide-react import**

Find this import near the top of the file:

```ts
import {
  Sparkles, Loader2, CheckCircle2, AlertTriangle, Import,
  Upload, ChevronDown, ChevronUp, RotateCcw, Trash2, Eye, FileText, Clock,
} from 'lucide-react'
```

Change it to:

```ts
import {
  Sparkles, Loader2, CheckCircle2, AlertTriangle, Import,
  Upload, ChevronDown, ChevronUp, RotateCcw, Trash2, Eye, FileText, Clock,
  DollarSign, Pencil, X,
} from 'lucide-react'
```

- [ ] **Step 2: Add the 2 local mutation hooks**

Find `function useAtualizarTipoValorContrato(processoId: string) {` and
add these two new functions right after it (same file, same pattern —
plain Supabase update + invalidate `['processos', processoId]`):

```ts
function useAtualizarFinanciouProspectado(processoId: string) {
  const { usuario } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { financiou?: boolean | null; prospectado_por?: 'fontinhas' | 'direto' | null }) => {
      const { error } = await supabase
        .from('processos')
        .update(payload)
        .eq('id', processoId)
        .eq('empresa_id', usuario!.empresa_id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['processos', processoId] }),
  })
}

function useConfirmarPagamentoContrato(processoId: string) {
  const { usuario } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data_pagamento_contrato: string | null) => {
      const { error } = await supabase
        .from('processos')
        .update({ data_pagamento_contrato })
        .eq('id', processoId)
        .eq('empresa_id', usuario!.empresa_id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['processos', processoId] }),
  })
}
```

- [ ] **Step 3: Wire the hooks and local state into `ContratoConstrutor`**

Find this line inside `export function ContratoConstrutor({ processo }: { processo: Processo }) {`:

```ts
  const atualizar = useAtualizarTipoValorContrato(processo.id)
```

Add right after it:

```ts
  const atualizarFinanciouProspectado = useAtualizarFinanciouProspectado(processo.id)
  const confirmarPagamento = useConfirmarPagamentoContrato(processo.id)
  const [confirmandoPagamento, setConfirmandoPagamento] = useState(false)
  const [dataPagamentoInput, setDataPagamentoInput] = useState('')
```

- [ ] **Step 4: Change the Responsáveis/Modelo grid to 3 columns and add the Pagamento card**

Find this block (added in the PR #253 layout fix):

```tsx
        {/* Responsáveis + ① Modelo + Valor — dividem a mesma linha em telas largas */}
        <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-gray-200 bg-white p-4">
          <BlocoResponsaveis processo={processo} />
        </section>

        <section className="grid gap-3 rounded-lg border border-gray-200 bg-white p-4 sm:grid-cols-2">
```

Change `lg:grid-cols-2` to `lg:grid-cols-3`, and after the closing
`</section>` of the Modelo/Valor block (right before the `</div>` that
closes this grid — the one immediately followed by `{/* ② Documentos —
comprador / vendedor / imóvel */}`), insert the new Pagamento section:

```tsx
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Pagamento</h4>
          <div className="flex flex-wrap gap-3">
            <div className="min-w-[120px] flex-1">
              <label className="text-xs text-gray-500 mb-1 block">Financiou</label>
              <Select
                value={processo.financiou === true ? 'sim' : processo.financiou === false ? 'nao' : '__indefinido'}
                onValueChange={(v) => atualizarFinanciouProspectado.mutate({ financiou: v === 'sim' ? true : v === 'nao' ? false : null })}
              >
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__indefinido">—</SelectItem>
                  <SelectItem value="sim">Sim</SelectItem>
                  <SelectItem value="nao">Não</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[120px] flex-1">
              <label className="text-xs text-gray-500 mb-1 block">Prospectado por</label>
              <Select
                value={processo.prospectado_por ?? '__indefinido'}
                onValueChange={(v) => atualizarFinanciouProspectado.mutate({ prospectado_por: v === '__indefinido' ? null : (v as 'fontinhas' | 'direto') })}
              >
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__indefinido">—</SelectItem>
                  <SelectItem value="fontinhas">Fontinhas</SelectItem>
                  <SelectItem value="direto">Direto</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {processo.data_pagamento_contrato && !confirmandoPagamento ? (
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-fonti-primary">
                Pago em {new Date(processo.data_pagamento_contrato).toLocaleDateString('pt-BR')}
              </p>
              <button
                onClick={() => { setDataPagamentoInput(processo.data_pagamento_contrato!); setConfirmandoPagamento(true) }}
                className="p-1 rounded text-gray-300 hover:text-fonti-primary hover:bg-gray-100 transition-colors"
                title="Corrigir data"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => confirmarPagamento.mutate(null)}
                className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-gray-100 transition-colors"
                title="Desfazer confirmação de pagamento"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : confirmandoPagamento ? (
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={dataPagamentoInput}
                onChange={(e) => setDataPagamentoInput(e.target.value)}
                className="h-8 w-40 text-sm"
              />
              <Button
                size="sm"
                className="h-8 bg-fonti-primary hover:bg-fonti-primary-hover text-white"
                disabled={!dataPagamentoInput || confirmarPagamento.isPending}
                onClick={() => confirmarPagamento.mutate(dataPagamentoInput, { onSuccess: () => setConfirmandoPagamento(false) })}
              >
                Salvar
              </Button>
              <Button size="sm" variant="outline" className="h-8" onClick={() => setConfirmandoPagamento(false)}>
                Cancelar
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 text-xs"
              onClick={() => { setDataPagamentoInput(new Date().toISOString().slice(0, 10)); setConfirmandoPagamento(true) }}
            >
              <DollarSign className="h-3.5 w-3.5" />
              Confirmar Pagamento
            </Button>
          )}
        </section>
        </div>
```

(The final `</div>` above is the one that already closed the 2-column
grid — don't duplicate it, just confirm the new section sits between the
Modelo/Valor `</section>` and that existing closing `</div>`.)

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit -p .
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/processos/ContratoConstrutor.tsx
git commit -m "$(cat <<'EOF'
feat: card Pagamento no Processo de Contrato

Financiou (sim/não), Prospectado por (Fontinhas/Direto) e confirmação de
pagamento com data editável — dados consumidos pela aba Financeiro >
Análise de Comissões > Contratos.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Sub-abas em `AbaAnaliseComissoes.tsx`

**Files:**
- Modify: `src/components/financeiro/AbaAnaliseComissoes.tsx` (full-file rewrite — restructuring the top-level export)

**Interfaces:**
- Consumes: `useAnaliseComissoesContratosMes` (Task 3),
  `FinAnaliseComissaoContratoLinha` (Task 2).
- Produces: `AbaAnaliseComissoes({ mes, ano }: { mes: number; ano: number
  })` — same name/props as before, still imported unchanged by
  `src/app/(protected)/financeiro/page.tsx` (no change needed there).

- [ ] **Step 1: Replace the entire file content**

```tsx
'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Search } from 'lucide-react'
import {
  useAnaliseComissoesMes,
  useAtualizarCgiManual,
  useAnaliseComissoesContratosMes,
} from '@/hooks/financeiro/useAnaliseComissoes'
import {
  type FinAnaliseComissaoLinha,
  type FinAnaliseComissaoContratoLinha,
  type FinResponsavelRegistro,
} from '@/types/financeiro'
import { formatarMoeda } from '@/lib/utils'

interface Props { mes: number; ano: number }

type SubAba = 'financiamento' | 'contratos'

export function AbaAnaliseComissoes({ mes, ano }: Props) {
  const [subAba, setSubAba] = useState<SubAba>('financiamento')

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-lg bg-gray-100 p-1 w-fit">
        <button
          onClick={() => setSubAba('financiamento')}
          className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
            subAba === 'financiamento' ? 'bg-white text-fonti-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Financiamento
        </button>
        <button
          onClick={() => setSubAba('contratos')}
          className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
            subAba === 'contratos' ? 'bg-white text-fonti-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Contratos
        </button>
      </div>

      {subAba === 'financiamento'
        ? <VisaoAnaliseComissoesFinanciamento mes={mes} ano={ano} />
        : <VisaoAnaliseComissoesContratos mes={mes} ano={ano} />}
    </div>
  )
}

const REGISTRO_LABEL: Record<FinResponsavelRegistro, string> = {
  fontinhas: 'Fontinhas',
  cliente: 'Cliente',
  corretor: 'Corretor',
}

function VisaoAnaliseComissoesFinanciamento({ mes, ano }: Props) {
  const { data, isLoading } = useAnaliseComissoesMes(mes, ano)
  const atualizarCgi = useAtualizarCgiManual()
  const linhas = data ?? []

  const [busca, setBusca] = useState('')

  const filtradas = linhas.filter(l =>
    !busca ||
    l.cliente_nome?.toLowerCase().includes(busca.toLowerCase()) ||
    l.cliente_cpf?.includes(busca) ||
    l.banco_nome?.toLowerCase().includes(busca.toLowerCase())
  )

  const totalComissao = filtradas.reduce((s, l) => s + l.comissao, 0)
  const totalFinal = filtradas.reduce((s, l) => s + (l.comissao - (l.cgi_manual ?? 0)), 0)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-white p-3">
          <p className="text-xs text-gray-500">Contratos</p>
          <p className="text-lg font-semibold text-fonti-primary">{filtradas.length}</p>
        </div>
        <div className="rounded-lg border bg-white p-3">
          <p className="text-xs text-gray-500">Comissão (cheia)</p>
          <p className="text-lg font-semibold text-fonti-primary">{formatarMoeda(totalComissao)}</p>
        </div>
        <div className="rounded-lg border bg-white p-3">
          <p className="text-xs text-gray-500">Comissão final</p>
          <p className="text-lg font-semibold text-green-700">{formatarMoeda(totalFinal)}</p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
        <Input
          className="pl-9"
          placeholder="Buscar por cliente, CPF ou banco..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
        />
      </div>

      <div className="rounded-lg border bg-white overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead className="text-xs">Cliente</TableHead>
              <TableHead className="text-xs">CPF</TableHead>
              <TableHead className="text-xs">Banco</TableHead>
              <TableHead className="text-xs">Modalidade</TableHead>
              <TableHead className="text-xs text-right">Valor Financiado</TableHead>
              <TableHead className="text-xs">Comercial</TableHead>
              <TableHead className="text-xs text-right">Assessoria</TableHead>
              <TableHead className="text-xs">Registro</TableHead>
              <TableHead className="text-xs text-right">Comissão</TableHead>
              <TableHead className="text-xs text-right">Checagem</TableHead>
              <TableHead className="text-xs text-right">CGI 1%</TableHead>
              <TableHead className="text-xs text-right">Comissão Final</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={12} className="text-center py-8 text-gray-400 text-sm">Carregando...</TableCell></TableRow>
            ) : filtradas.length === 0 ? (
              <TableRow><TableCell colSpan={12} className="text-center py-8 text-gray-400 text-sm">Nenhum contrato emitido neste mês.</TableCell></TableRow>
            ) : (
              filtradas.map(l => (
                <LinhaAnaliseComissao key={l.id} linha={l} onSalvarCgi={v => atualizarCgi.mutate({ processo_id: l.processo_id, cgi_manual: v })} />
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function LinhaAnaliseComissao({ linha, onSalvarCgi }: { linha: FinAnaliseComissaoLinha; onSalvarCgi: (v: number | null) => void }) {
  const [cgiInput, setCgiInput] = useState(linha.cgi_manual != null ? String(linha.cgi_manual) : '')
  const cgiAtual = linha.cgi_manual ?? 0
  const comissaoFinal = linha.comissao - cgiAtual

  return (
    <TableRow className="hover:bg-gray-50">
      <TableCell className="text-sm font-medium">{linha.cliente_nome || '—'}</TableCell>
      <TableCell className="text-sm text-gray-500">{linha.cliente_cpf || '—'}</TableCell>
      <TableCell>
        {linha.banco_nome ? (
          <span className="flex items-center gap-1 text-sm">
            {linha.banco_cor && <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: linha.banco_cor }} />}
            {linha.banco_nome}
          </span>
        ) : <span className="text-gray-400 text-sm">—</span>}
      </TableCell>
      <TableCell className="text-sm text-gray-600">{linha.modalidade ?? '—'}</TableCell>
      <TableCell className="text-right text-sm font-mono">
        {linha.valor_financiado != null ? formatarMoeda(linha.valor_financiado) : '—'}
      </TableCell>
      <TableCell className="text-sm text-gray-600">{linha.comercial_nome ?? '—'}</TableCell>
      <TableCell className="text-right text-sm font-mono">{formatarMoeda(linha.valor_assessoria)}</TableCell>
      <TableCell className="text-sm text-gray-600">
        {linha.responsavel_registro ? REGISTRO_LABEL[linha.responsavel_registro] : '—'}
      </TableCell>
      <TableCell className="text-right text-sm font-mono">{formatarMoeda(linha.comissao)}</TableCell>
      <TableCell className="text-right text-sm text-gray-500">{linha.percentual_comissao.toFixed(2)}%</TableCell>
      <TableCell className="text-right">
        <Input
          type="number"
          step="0.01"
          value={cgiInput}
          onChange={e => setCgiInput(e.target.value)}
          onBlur={() => {
            const v = cgiInput === '' ? null : parseFloat(cgiInput)
            if (v !== (linha.cgi_manual ?? null)) onSalvarCgi(v)
          }}
          className="h-8 w-28 text-right text-sm font-mono ml-auto"
          placeholder="0,00"
        />
      </TableCell>
      <TableCell className="text-right text-sm font-mono font-medium text-fonti-primary">{formatarMoeda(comissaoFinal)}</TableCell>
    </TableRow>
  )
}

const PROSPECTADO_POR_LABEL: Record<'fontinhas' | 'direto', string> = {
  fontinhas: 'Fontinhas',
  direto: 'Direto',
}

function VisaoAnaliseComissoesContratos({ mes, ano }: Props) {
  const { data, isLoading } = useAnaliseComissoesContratosMes(mes, ano)
  const linhas = data ?? []

  const [busca, setBusca] = useState('')

  const filtradas = linhas.filter(l =>
    !busca ||
    l.cliente_nome?.toLowerCase().includes(busca.toLowerCase()) ||
    l.cliente_cpf?.includes(busca)
  )

  const totalValor = filtradas.reduce((s, l) => s + (l.valor_contrato ?? 0), 0)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border bg-white p-3">
          <p className="text-xs text-gray-500">Contratos</p>
          <p className="text-lg font-semibold text-fonti-primary">{filtradas.length}</p>
        </div>
        <div className="rounded-lg border bg-white p-3">
          <p className="text-xs text-gray-500">Valor total</p>
          <p className="text-lg font-semibold text-fonti-primary">{formatarMoeda(totalValor)}</p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
        <Input
          className="pl-9"
          placeholder="Buscar por cliente ou CPF..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
        />
      </div>

      <div className="rounded-lg border bg-white overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead className="text-xs">Cliente</TableHead>
              <TableHead className="text-xs">CPF</TableHead>
              <TableHead className="text-xs">Comercial</TableHead>
              <TableHead className="text-xs">Corretor</TableHead>
              <TableHead className="text-xs">Imobiliária</TableHead>
              <TableHead className="text-xs">Prospectado por</TableHead>
              <TableHead className="text-xs">Financiou</TableHead>
              <TableHead className="text-xs text-right">Valor</TableHead>
              <TableHead className="text-xs">Data de Recebimento</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={9} className="text-center py-8 text-gray-400 text-sm">Carregando...</TableCell></TableRow>
            ) : filtradas.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center py-8 text-gray-400 text-sm">Nenhum contrato pago neste mês.</TableCell></TableRow>
            ) : (
              filtradas.map(l => (
                <TableRow key={l.id} className="hover:bg-gray-50">
                  <TableCell className="text-sm font-medium">{l.cliente_nome || '—'}</TableCell>
                  <TableCell className="text-sm text-gray-500">{l.cliente_cpf || '—'}</TableCell>
                  <TableCell className="text-sm text-gray-600">{l.comercial_nome ?? '—'}</TableCell>
                  <TableCell className="text-sm text-gray-600">{l.corretor_nome ?? '—'}</TableCell>
                  <TableCell className="text-sm text-gray-600">{l.imobiliaria_nome ?? '—'}</TableCell>
                  <TableCell className="text-sm text-gray-600">
                    {l.prospectado_por ? PROSPECTADO_POR_LABEL[l.prospectado_por] : '—'}
                  </TableCell>
                  <TableCell className="text-sm text-gray-600">
                    {l.financiou == null ? '—' : l.financiou ? 'Sim' : 'Não'}
                  </TableCell>
                  <TableCell className="text-right text-sm font-mono">
                    {l.valor_contrato != null ? formatarMoeda(l.valor_contrato) : '—'}
                  </TableCell>
                  <TableCell className="text-sm text-gray-500">
                    {l.data_pagamento_contrato ? new Date(l.data_pagamento_contrato).toLocaleDateString('pt-BR') : '—'}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit -p .
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/financeiro/AbaAnaliseComissoes.tsx
git commit -m "$(cat <<'EOF'
feat: sub-aba Contratos em Financeiro > Análise de Comissões

Reestrutura em 2 sub-abas (Financiamento/Contratos, mesmo padrão do
Consórcio) — conteúdo de Financiamento sem mudança de comportamento.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Push, PR, merge, and manual browser verification

**Files:** none (git + manual QA)

**Interfaces:**
- Consumes: everything from Tasks 1-5.

- [ ] **Step 1: Push the branch and open the PR**

```bash
git push -u origin feat/aba-contratos-analise-comissoes
gh pr create --base main --head feat/aba-contratos-analise-comissoes \
  --title "feat: aba Contratos em Financeiro > Análise de Comissões" \
  --body "$(cat <<'EOF'
## Summary
- Nova sub-aba "Contratos" em Financeiro > Análise de Comissões: demonstrativo mensal de contratos particulares pagos, filtrado por data de confirmação de pagamento (não a data de criação).
- Novo card "Pagamento" na tela do Processo de Contrato: Financiou (sim/não), Prospectado por (Fontinhas/Direto), e confirmação de pagamento com data editável/desfazível.
- Migration 293: colunas financiou/prospectado_por/data_pagamento_contrato em processos + função analise_comissoes_contratos_mes.

Spec: docs/superpowers/specs/2026-09-11-aba-contratos-analise-comissoes-design.md

## Test plan
- [x] tsc --noEmit sem erros em cada task
- [ ] Migration rodada pelo usuário no Supabase
- [ ] Verificação manual no navegador (ver checklist abaixo)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 2: Ask the user to run the migration**

Say explicitly: the file
`supabase/migrations/20260911_293_analise_comissoes_contratos.sql` needs
to be run in the Supabase SQL Editor before the checklist below can be
verified. Wait for confirmation before continuing to Step 3.

- [ ] **Step 3: Manual browser verification**

Start the dev server (`npm run dev`), log in, and check every item:

1. Open a Contrato process (or create one). Confirm the new "Pagamento"
   card appears next to Responsáveis and Modelo de contrato/Valor do
   Serviço, all 3 in one row on a wide screen.
2. Set "Financiou" to Sim, reload the page — it must still show Sim (not
   reset to "—").
3. Set "Prospectado por" to Direto, reload — must persist.
4. Click "Confirmar Pagamento", pick a date inside the current calendar
   month, click Salvar — the card must switch to showing "Pago em
   DD/MM/AAAA" with a pencil and an X icon.
5. Go to Financeiro > Análise de Comissões > Contratos (new sub-aba,
   next to "Financiamento") for the current month — the contract from
   step 4 must appear, with the right Cliente/CPF/Comercial/Financiou
   (Sim)/Prospectado por (Direto)/Valor/Data de Recebimento.
6. Click the X icon on the Pagamento card to undo the confirmation — the
   contract must disappear from the Contratos sub-aba after reload.
7. Confirm payment again with a date in a *different* month than today —
   navigate the top month selector to that month — the contract must
   appear there, and NOT in the current month's Contratos list.
8. Switch back to the "Financiamento" sub-aba — confirm it still shows
   the exact same data/behavior as before this plan (no regression).

If any item fails, stop and report which one — do not proceed to
merging with a known-failing item.

- [ ] **Step 4: Merge**

```bash
gh pr merge <PR_NUMBER> --squash --delete-branch
git checkout main --quiet
git pull --ff-only origin main
git branch -d feat/aba-contratos-analise-comissoes
```
