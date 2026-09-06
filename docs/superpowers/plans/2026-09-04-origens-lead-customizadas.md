# Origens de Lead Customizadas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deixar o admin gerenciar a lista de "Origem" de um Lead pela tela `Configurações → Origens de Leads` — renomear qualquer uma das 11 origens atuais, e criar/renomear/desativar as que não são de webhook automático — sem quebrar os webhooks/bot que já criam leads automaticamente.

**Architecture:** Nova tabela `origens_lead` (código estável + nome editável + `sistema`/`ativo`, escopada por empresa) substitui o enum fixo `lead_origem` como fonte de verdade. A coluna `leads.origem` deixa de ser enum e vira `TEXT` — os webhooks continuam gravando exatamente os mesmos literais de sempre (`'site'`, `'whatsapp'` etc.), então nenhum deles precisa mudar. As 5 telas que hoje mostram um dropdown fixo de origem passam a ler da tabela nova via um hook (`useOrigensLead`).

**Tech Stack:** Next.js 14 (App Router), Supabase (Postgres + RLS), React Query, react-hook-form + zod, Tailwind, shadcn/ui, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-04-origens-lead-customizadas-design.md`

## Global Constraints

- Origem com `sistema=true` (as 5 automáticas: `site`, `whatsapp`, `instagram`, `facebook`, `indicacao`): só o campo `nome` pode ser editado — nunca desativada, nunca excluída, `codigo` nunca muda.
- Origem com `sistema=false` (as 6 manuais + qualquer nova criada): pode ser criada, renomeada, desativada (soft-delete via `ativo=false`) — nunca excluída fisicamente.
- Webhooks (`api/leads/webhook`, `api/instagram/webhook`, `api/parceiros/webhook/indicacao`, `api/bot/whatsapp/webhook`, `api/bot/site/message`) **não são tocados** por este plano — continuam gravando os mesmos literais de string de sempre.
- RLS de escrita em `origens_lead` segue o padrão já estabelecido para tabelas de catálogo deste projeto (`fases`, `bancos`, `produtos`): `perfil IN ('admin', 'gerente')` — **não** `configuracoes.editar` (a spec sugeriu esse caminho antes de eu confirmar, nesta fase de implementação, que o padrão real do projeto para tabelas de catálogo é a checagem direta de perfil; RLS de leitura continua aberta a qualquer usuário ativo da empresa, sem checagem de perfil, igual a `fases_select`/`bancos_select`).
- Numeração de migration a partir de `285` (última existente: `20260904_284_convites_perfil_customizado_tenant_check.sql`).
- Rodar `npx tsc --noEmit` limpo ao final de cada task que toca TypeScript.
- Rodar `npm run test` (vitest) limpo ao final de cada task que toca lógica testável.

---

## Task 1: Migration — tabela `origens_lead` + RLS + seed

**Files:**
- Create: `supabase/migrations/20260904_285_origens_lead.sql`

**Interfaces:**
- Produces: tabela `origens_lead(id, empresa_id, codigo, nome, sistema, ativo, created_at, updated_at)`, populada com as 11 origens atuais para cada empresa existente. Usada por Task 4 (hooks) e Task 2 (a próxima migration, que muda o tipo da coluna `leads.origem` — não depende desta tabela tecnicamente, mas segue ela na numeração por ordem lógica).

- [ ] **Step 1: Escrever a migration**

```sql
-- Origens de Lead Customizadas — Task 1/2.
--
-- Substitui o enum fixo lead_origem como fonte de verdade da lista de
-- origens: catálogo por empresa, com código estável (o que fica gravado em
-- leads.origem — nunca muda) e nome editável (o que aparece na tela).
--
-- sistema=true: as 5 origens gravadas automaticamente por webhook/bot
-- (site, whatsapp, instagram, facebook, indicacao) — só o nome pode ser
-- editado, nunca desativadas/excluídas (a Task 4 impõe essa regra nos
-- hooks; aqui não há CHECK específico, mesmo padrão de confiança já usado
-- em outras tabelas de configuração deste projeto).
-- sistema=false: as 6 manuais existentes mais qualquer nova criada pela
-- tela — aceitam criar/renomear/desativar (nunca excluir fisicamente).

CREATE TABLE origens_lead (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID        NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  codigo      TEXT        NOT NULL,
  nome        TEXT        NOT NULL,
  sistema     BOOLEAN     NOT NULL DEFAULT false,
  ativo       BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, codigo)
);

CREATE INDEX idx_origens_lead_empresa ON origens_lead(empresa_id);

ALTER TABLE origens_lead ENABLE ROW LEVEL SECURITY;

-- Leitura aberta a qualquer usuário ativo da empresa — necessário nos
-- dropdowns de preenchimento manual, usados por qualquer perfil com
-- leads.criar/leads.editar. Mesmo padrão de fases_select/bancos_select
-- (sem checagem de perfil na leitura).
CREATE POLICY "origens_lead_select" ON origens_lead
  FOR SELECT USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid())
  );

CREATE POLICY "origens_lead_insert" ON origens_lead
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE id = auth.uid() AND perfil IN ('admin', 'gerente') AND empresa_id = origens_lead.empresa_id
    )
  );

CREATE POLICY "origens_lead_update" ON origens_lead
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE id = auth.uid() AND perfil IN ('admin', 'gerente') AND empresa_id = origens_lead.empresa_id
    )
  );

COMMENT ON TABLE origens_lead IS
  'Catálogo de origens de Lead por empresa. codigo é o valor gravado em leads.origem (estável); nome é o rótulo exibido (editável). sistema=true = as 5 automáticas por webhook, nunca desativáveis.';

-- Seed: cada empresa existente recebe as 11 linhas atuais, com o mesmo
-- texto e código já usados em produção hoje — não muda nada visualmente
-- até alguém editar pela tela nova.
INSERT INTO origens_lead (empresa_id, codigo, nome, sistema)
SELECT id, v.codigo, v.nome, v.sistema
FROM empresas
CROSS JOIN (VALUES
  ('site',               'Site',               true),
  ('whatsapp',           'WhatsApp',           true),
  ('instagram',          'Instagram',          true),
  ('facebook',           'Facebook',           true),
  ('indicacao',          'Indicação',          true),
  ('direto',             'Direto',             false),
  ('corretor',           'Corretor',           false),
  ('imobiliaria',        'Imobiliária',        false),
  ('construtora',        'Construtora',        false),
  ('parceiro_comercial', 'Parceiro Comercial', false),
  ('outros',             'Outros',             false)
) AS v(codigo, nome, sistema);
```

- [ ] **Step 2: Rodar a migration no Supabase**

Executar o SQL acima no SQL Editor do Supabase. Se o ambiente de implementação não tiver credenciais/CLI do Supabase disponíveis, pular este step e reportar como pendência manual do usuário — não é bloqueante para as próximas tasks (nenhuma delas precisa de um banco real pra compilar ou passar nos testes automatizados).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260904_285_origens_lead.sql
git commit -m "feat: tabela origens_lead (catálogo de origens de lead por empresa)"
```

---

## Task 2: Migration — `leads.origem` deixa de ser enum

**Files:**
- Create: `supabase/migrations/20260904_286_leads_origem_texto.sql`

**Interfaces:**
- Consumes: nada da Task 1 (mudança de tipo de coluna é independente da tabela nova — só numerada depois por ordem lógica).
- Produces: `leads.origem` como `TEXT` em vez do enum `lead_origem`. Usado implicitamente por todas as tasks de frontend (Tasks 5-12), que deixam de tratar `origem` como união fechada.

- [ ] **Step 1: Escrever a migration**

```sql
-- Origens de Lead Customizadas — Task 2/2.
--
-- leads.origem deixa de ser o enum lead_origem — vira TEXT livre. Os
-- webhooks continuam inserindo os mesmos literais de sempre ('site',
-- 'whatsapp' etc.), então nada mais no código precisa mudar por causa
-- desta migration. Sem FK contra origens_lead.codigo de propósito (mesmo
-- padrão de confiança já usado em outras colunas texto deste projeto,
-- ex. perfil_permissoes.acao) — o catálogo valida na UI, não no banco.
--
-- O tipo lead_origem (enum) não é dropado — fica órfão no schema,
-- inofensivo, mais simples e seguro que tentar removê-lo.

ALTER TABLE leads ALTER COLUMN origem TYPE TEXT USING origem::text;
```

- [ ] **Step 2: Rodar a migration no Supabase**

Mesma ressalva do Task 1 — pular execução real se não houver acesso a um banco Supabase neste ambiente, reportar como pendência.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260904_286_leads_origem_texto.sql
git commit -m "feat: leads.origem deixa de ser enum, vira texto"
```

---

## Task 3: Helpers puros — slug de código + geração com dedupe

**Files:**
- Create: `src/app/(protected)/configuracoes/_hooks/origensLeadHelpers.ts`
- Test: `src/app/(protected)/configuracoes/_hooks/__tests__/origensLeadHelpers.test.ts`

**Interfaces:**
- Produces: `slugify(texto: string): string`, `gerarCodigoUnico(nome: string, codigosExistentes: string[]): string` — usados por Task 4 (`useCriarOrigemLead`).

- [ ] **Step 1: Escrever os testes**

```typescript
import { describe, it, expect } from 'vitest'
import { slugify, gerarCodigoUnico } from '../origensLeadHelpers'

describe('slugify', () => {
  it('minúsculas, sem acento, espaços viram underscore', () => {
    expect(slugify('Parceiro Comercial')).toBe('parceiro_comercial')
  })

  it('remove acentuação', () => {
    expect(slugify('Indicação')).toBe('indicacao')
  })

  it('colapsa underscores repetidos e remove das pontas', () => {
    expect(slugify('  Feira -- Imóveis  ')).toBe('feira_imoveis')
  })

  it('string vazia ou só símbolos vira string vazia', () => {
    expect(slugify('   ')).toBe('')
    expect(slugify('!!!')).toBe('')
  })
})

describe('gerarCodigoUnico', () => {
  it('sem colisão, usa o slug direto', () => {
    expect(gerarCodigoUnico('Feira de Imóveis', ['site', 'whatsapp'])).toBe('feira_de_imoveis')
  })

  it('com colisão, adiciona sufixo numérico incremental', () => {
    expect(gerarCodigoUnico('Parceiro', ['parceiro', 'parceiro_2'])).toBe('parceiro_3')
  })

  it('nome que vira slug vazio usa "origem" como base', () => {
    expect(gerarCodigoUnico('!!!', [])).toBe('origem')
    expect(gerarCodigoUnico('!!!', ['origem'])).toBe('origem_2')
  })
})
```

- [ ] **Step 2: Rodar os testes para confirmar que falham**

Run: `npx vitest run "src/app/(protected)/configuracoes/_hooks/__tests__/origensLeadHelpers.test.ts"`
Expected: FAIL — módulo `../origensLeadHelpers` não existe.

- [ ] **Step 3: Implementar**

```typescript
/**
 * Gera o "codigo" estável de uma origem de lead a partir do nome digitado
 * pelo admin — minúsculas, sem acento, espaços/símbolos viram underscore.
 * Puramente cosmético na hora da criação: depois de criado, o codigo nunca
 * muda mesmo que o nome seja editado (ver useRenomearOrigemLead).
 */
export function slugify(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove diacríticos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

/**
 * Slug + dedupe contra os códigos já existentes na empresa — evita colidir
 * com a UNIQUE(empresa_id, codigo) da tabela origens_lead. Nome que vira
 * slug vazio (ex: só símbolos) cai no fallback "origem".
 */
export function gerarCodigoUnico(nome: string, codigosExistentes: string[]): string {
  const base = slugify(nome) || 'origem'
  const existentes = new Set(codigosExistentes)
  if (!existentes.has(base)) return base

  let contador = 2
  while (existentes.has(`${base}_${contador}`)) {
    contador += 1
  }
  return `${base}_${contador}`
}
```

- [ ] **Step 4: Rodar os testes para confirmar que passam**

Run: `npx vitest run "src/app/(protected)/configuracoes/_hooks/__tests__/origensLeadHelpers.test.ts"`
Expected: PASS (9 testes)

- [ ] **Step 5: Commit**

```bash
git add "src/app/(protected)/configuracoes/_hooks/origensLeadHelpers.ts" "src/app/(protected)/configuracoes/_hooks/__tests__/origensLeadHelpers.test.ts"
git commit -m "feat: helpers de slug/dedupe pra código de origem de lead"
```

---

## Task 4: Hooks de CRUD `useOrigensLead` + wrapper de re-export

**Files:**
- Create: `src/app/(protected)/configuracoes/_hooks/useOrigensLead.ts`
- Create: `src/hooks/leads/useOrigensLead.ts`

**Interfaces:**
- Consumes: `gerarCodigoUnico` (Task 3).
- Produces: `useOrigensLead()` (ativas, pra dropdowns), `useTodasOrigensLead()` (ativas+inativas, pra tela de admin), `useCriarOrigemLead()`, `useRenomearOrigemLead()`, `useDesativarOrigemLead()`, `useReativarOrigemLead()`, tipo `OrigemLead`. Consumidos por Task 7 (tela de admin) e Tasks 6/8-12 (badge + 5 dropdowns) via o wrapper de re-export em `src/hooks/leads/useOrigensLead.ts` (mesmo padrão de `src/hooks/configuracoes/useFases.ts` re-exportando `configuracoes/_hooks/useFases.ts`).

- [ ] **Step 1: Implementar os hooks**

Criar `src/app/(protected)/configuracoes/_hooks/useOrigensLead.ts`:

```typescript
'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/auth/useAuth'
import { gerarCodigoUnico } from './origensLeadHelpers'

const supabase = createClient()

export interface OrigemLead {
  id: string
  empresa_id: string
  codigo: string
  nome: string
  sistema: boolean
  ativo: boolean
  created_at: string
  updated_at: string
}

/** Origens ativas da empresa — usado pelos dropdowns de preenchimento manual. */
export function useOrigensLead() {
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['origens-lead', usuario?.empresa_id],
    queryFn: async (): Promise<OrigemLead[]> => {
      const { data, error } = await supabase
        .from('origens_lead')
        .select('*')
        .eq('empresa_id', usuario!.empresa_id)
        .eq('ativo', true)
        .order('nome')
      if (error) throw error
      return data ?? []
    },
    enabled: !!usuario,
    staleTime: 60_000,
  })
}

/** Todas as origens da empresa (ativas e inativas) — só a tela de administração usa. */
export function useTodasOrigensLead() {
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['origens-lead', 'todas', usuario?.empresa_id],
    queryFn: async (): Promise<OrigemLead[]> => {
      const { data, error } = await supabase
        .from('origens_lead')
        .select('*')
        .eq('empresa_id', usuario!.empresa_id)
        .order('sistema', { ascending: false })
        .order('nome')
      if (error) throw error
      return data ?? []
    },
    enabled: !!usuario,
    staleTime: 60_000,
  })
}

export function useCriarOrigemLead() {
  const { usuario } = useAuth()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (nome: string): Promise<OrigemLead> => {
      if (!usuario?.empresa_id) throw new Error('Usuário não autenticado')

      const { data: existentes, error: erroExistentes } = await supabase
        .from('origens_lead')
        .select('codigo')
        .eq('empresa_id', usuario.empresa_id)
      if (erroExistentes) throw erroExistentes

      const codigo = gerarCodigoUnico(nome, (existentes ?? []).map((o) => o.codigo))

      const { data, error } = await supabase
        .from('origens_lead')
        .insert({ empresa_id: usuario.empresa_id, codigo, nome, sistema: false, ativo: true })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['origens-lead'] }),
  })
}

/** Renomear funciona tanto pras automáticas (sistema=true) quanto pras manuais — só o nome muda, nunca o codigo. */
export function useRenomearOrigemLead() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, nome }: { id: string; nome: string }) => {
      const { error } = await supabase.from('origens_lead').update({ nome }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['origens-lead'] }),
  })
}

export function useDesativarOrigemLead() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (origem: OrigemLead) => {
      if (origem.sistema) {
        throw new Error('Origens automáticas não podem ser desativadas — só renomeadas.')
      }
      const { error } = await supabase.from('origens_lead').update({ ativo: false }).eq('id', origem.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['origens-lead'] }),
  })
}

export function useReativarOrigemLead() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('origens_lead').update({ ativo: true }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['origens-lead'] }),
  })
}
```

- [ ] **Step 2: Criar o wrapper de re-export**

Criar `src/hooks/leads/useOrigensLead.ts`:

```typescript
export {
  useOrigensLead,
  useTodasOrigensLead,
  useCriarOrigemLead,
  useRenomearOrigemLead,
  useDesativarOrigemLead,
  useReativarOrigemLead,
  type OrigemLead,
} from '@/app/(protected)/configuracoes/_hooks/useOrigensLead'
```

- [ ] **Step 3: Rodar `tsc`**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add "src/app/(protected)/configuracoes/_hooks/useOrigensLead.ts" "src/hooks/leads/useOrigensLead.ts"
git commit -m "feat: hooks de CRUD de origens de lead"
```

---

## Task 5: `LeadOrigem` deixa de ser união fechada

**Files:**
- Modify: `src/types/leads.ts`

**Interfaces:**
- Produces: `LeadOrigem = string` — usado por `Lead.origem` e por todo o restante do plano.

- [ ] **Step 1: Editar**

Trocar as linhas 1-12 de `src/types/leads.ts`:

```typescript
export type LeadOrigem =
  | 'indicacao'
  | 'site'
  | 'whatsapp'
  | 'instagram'
  | 'facebook'
  | 'outros'
  | 'direto'
  | 'corretor'
  | 'imobiliaria'
  | 'construtora'
  | 'parceiro_comercial'
```

por:

```typescript
/**
 * Deixou de ser união fechada — leads.origem virou TEXT (migration 286),
 * com o catálogo de valores válidos vivendo em origens_lead (empresa a
 * empresa, editável pela tela Configurações > Origens de Leads). O tipo
 * continua existindo só por compatibilidade de nome nos call sites
 * existentes (Lead['origem'], LeadOrigemBadge, etc.).
 */
export type LeadOrigem = string
```

(O resto do arquivo — `StatusAnalise`, `EstadoCivil`, `ProdutoInteresse`,
`Lead`, etc. — permanece inalterado; `Lead.origem: LeadOrigem` continua
compilando sem mudança.)

- [ ] **Step 2: Rodar `tsc`**

Run: `npx tsc --noEmit`
Expected: podem aparecer erros em `LeadOrigemBadge.tsx` (`Record<LeadOrigem, ...>` com `LeadOrigem` agora igual a `string` — TypeScript não aceita `Record<string, T>` como literal fechado do jeito que o arquivo está escrito hoje) — Task 6 corrige. Confirmar que o erro é só nesse arquivo.

- [ ] **Step 3: Commit**

```bash
git add src/types/leads.ts
git commit -m "feat: LeadOrigem deixa de ser união fechada"
```

---

## Task 6: `LeadOrigemBadge` resolve nome/cor dinamicamente

**Files:**
- Modify: `src/components/leads/LeadOrigemBadge.tsx`

**Interfaces:**
- Consumes: `useOrigensLead()` (Task 4, via `@/hooks/leads/useOrigensLead`).
- Produces: `LeadOrigemBadge` continua com a mesma prop pública (`{ origem: string }`) — nenhum dos 3 call sites (`LeadListView.tsx`, `LeadDetalheModal.tsx`, `AbaVisaoGeral.tsx`) precisa mudar.

- [ ] **Step 1: Substituir o arquivo inteiro**

```typescript
'use client'

import { Badge } from '@/components/ui/badge'
import { useOrigensLead } from '@/hooks/leads/useOrigensLead'

// Cor por codigo conhecido — puramente estética, sem relação com o nome
// editável (que vem de origens_lead). Qualquer codigo fora desta lista
// (origem manual nova criada pela tela) cai no fallback cinza abaixo.
const CORES: Record<string, string> = {
  indicacao:          'bg-fonti-accent-hover text-fonti-primary border-fonti-accent',
  site:               'bg-blue-50 text-blue-700 border-blue-200',
  whatsapp:           'bg-green-50 text-green-700 border-green-200',
  instagram:          'bg-pink-50 text-pink-700 border-pink-200',
  facebook:           'bg-indigo-50 text-indigo-700 border-indigo-200',
  outros:             'bg-gray-50 text-gray-600 border-gray-200',
  direto:             'bg-gray-50 text-gray-600 border-gray-200',
  corretor:           'bg-amber-50 text-amber-700 border-amber-200',
  imobiliaria:        'bg-orange-50 text-orange-700 border-orange-200',
  construtora:        'bg-orange-50 text-orange-700 border-orange-200',
  parceiro_comercial: 'bg-purple-50 text-purple-700 border-purple-200',
}
const COR_FALLBACK = 'bg-gray-50 text-gray-600 border-gray-200'

export function LeadOrigemBadge({ origem }: { origem: string }) {
  const { data: origens = [] } = useOrigensLead()
  const encontrada = origens.find((o) => o.codigo === origem)

  const label = encontrada?.nome ?? origem
  const className = CORES[origem] ?? COR_FALLBACK

  return (
    <Badge variant="outline" className={`text-xs ${className}`}>
      {label}
    </Badge>
  )
}
```

Nota: a busca por `encontrada` só resolve origens ativas (`useOrigensLead`
retorna só `ativo=true`) — para um lead com origem já desativada, o badge
cai no fallback `label = origem` (mostra o `codigo` cru em vez do `nome`
salvo). Isso é uma limitação aceitável e conhecida: diferente do badge de
Perfil de Acesso (que resolve o nome customizado mesmo desativado, porque
tem acesso à lista completa), aqui simplificamos usando só a lista ativa —
o codigo dificilmente é ilegível (ex: `parceiro_comercial` ainda dá pra
entender), e o caso é raro (origem desativada bem depois de leads antigos
já existirem). Se este comportamento incomodar na prática, trocar para
`useTodasOrigensLead()` resolve — mudança pontual de uma linha, não fazer
preventivamente.

- [ ] **Step 2: Rodar `tsc`**

Run: `npx tsc --noEmit`
Expected: limpo (0 erros) — este era o único arquivo com erro pendente da Task 5.

- [ ] **Step 3: Commit**

```bash
git add src/components/leads/LeadOrigemBadge.tsx
git commit -m "feat: LeadOrigemBadge resolve nome/cor via catálogo de origens_lead"
```

---

## Task 7: Tela `Configurações → Origens de Leads`

**Files:**
- Create: `src/app/(protected)/configuracoes/_components/origens-lead/OrigensLeadConfig.tsx`
- Modify: `src/app/(protected)/configuracoes/page.tsx`

**Interfaces:**
- Consumes: `useTodasOrigensLead`, `useCriarOrigemLead`, `useRenomearOrigemLead`, `useDesativarOrigemLead`, `useReativarOrigemLead` (Task 4).
- Produces: item novo `origens-leads` na lista de Configurações, renderizando `OrigensLeadConfig`.

- [ ] **Step 1: Criar o componente da tela**

```typescript
'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import { Plus, Pencil, PowerOff, Power } from 'lucide-react'
import {
  useTodasOrigensLead, useCriarOrigemLead, useRenomearOrigemLead,
  useDesativarOrigemLead, useReativarOrigemLead, type OrigemLead,
} from '@/hooks/leads/useOrigensLead'

export function OrigensLeadConfig() {
  const { data: origens = [], isLoading } = useTodasOrigensLead()
  const criar = useCriarOrigemLead()
  const renomear = useRenomearOrigemLead()
  const desativar = useDesativarOrigemLead()
  const reativar = useReativarOrigemLead()

  const [dialogCriar, setDialogCriar] = useState(false)
  const [dialogRenomear, setDialogRenomear] = useState<OrigemLead | null>(null)
  const [nomeCampo, setNomeCampo] = useState('')

  async function handleCriar() {
    const nome = nomeCampo.trim()
    if (!nome) return
    try {
      await criar.mutateAsync(nome)
      setDialogCriar(false)
      setNomeCampo('')
      toast.success(`Origem "${nome}" criada.`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao criar origem.')
    }
  }

  async function handleRenomear() {
    if (!dialogRenomear) return
    const nome = nomeCampo.trim()
    if (!nome) return
    try {
      await renomear.mutateAsync({ id: dialogRenomear.id, nome })
      setDialogRenomear(null)
      setNomeCampo('')
      toast.success('Origem renomeada.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao renomear origem.')
    }
  }

  async function handleDesativar(origem: OrigemLead) {
    try {
      await desativar.mutateAsync(origem)
      toast.success(`Origem "${origem.nome}" desativada.`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao desativar origem.')
    }
  }

  async function handleReativar(origem: OrigemLead) {
    try {
      await reativar.mutateAsync(origem.id)
      toast.success(`Origem "${origem.nome}" reativada.`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao reativar origem.')
    }
  }

  if (isLoading) {
    return <p className="text-sm text-gray-400 py-8 text-center">Carregando...</p>
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          As origens automáticas (com o selo "Automática") só têm o nome editável — são gravadas
          por integrações (site, WhatsApp, Instagram, Facebook, indicação) e nunca podem ser
          desativadas. As demais podem ser criadas, renomeadas e desativadas livremente.
        </p>
      </div>

      <Button
        size="sm"
        className="gap-1.5 bg-fonti-primary hover:bg-fonti-primary-hover text-white"
        onClick={() => { setNomeCampo(''); setDialogCriar(true) }}
      >
        <Plus className="h-3.5 w-3.5" />
        Nova origem
      </Button>

      <div className="rounded-xl border border-gray-100 overflow-hidden divide-y divide-gray-100">
        {origens.map((origem) => (
          <div
            key={origem.id}
            className={`flex items-center justify-between gap-4 px-4 py-3 ${origem.ativo ? 'bg-white' : 'bg-gray-50 opacity-60'}`}
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-800">{origem.nome}</span>
              {origem.sistema && (
                <Badge variant="outline" className="text-[10px] text-gray-500 border-gray-300">Automática</Badge>
              )}
              {!origem.ativo && (
                <Badge variant="outline" className="text-[10px] text-gray-400 border-gray-300">Inativa</Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-400 hover:text-fonti-primary"
                title="Renomear"
                onClick={() => { setNomeCampo(origem.nome); setDialogRenomear(origem) }}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              {!origem.sistema && (
                origem.ativo ? (
                  <Button
                    variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-400 hover:text-red-500"
                    title="Desativar" onClick={() => handleDesativar(origem)}
                  >
                    <PowerOff className="h-3.5 w-3.5" />
                  </Button>
                ) : (
                  <Button
                    variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-400 hover:text-green-600"
                    title="Reativar" onClick={() => handleReativar(origem)}
                  >
                    <Power className="h-3.5 w-3.5" />
                  </Button>
                )
              )}
            </div>
          </div>
        ))}
      </div>

      <Dialog open={dialogCriar} onOpenChange={setDialogCriar}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Nova origem de lead</DialogTitle>
            <DialogDescription>Aparece nas telas de preenchimento manual de Captação.</DialogDescription>
          </DialogHeader>
          <Input placeholder="Ex: Feira de Imóveis" value={nomeCampo} onChange={(e) => setNomeCampo(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogCriar(false)}>Cancelar</Button>
            <Button onClick={handleCriar} disabled={!nomeCampo.trim() || criar.isPending}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!dialogRenomear} onOpenChange={(open) => !open && setDialogRenomear(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Renomear origem</DialogTitle>
          </DialogHeader>
          <Input placeholder="Nome da origem" value={nomeCampo} onChange={(e) => setNomeCampo(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogRenomear(null)}>Cancelar</Button>
            <Button onClick={handleRenomear} disabled={!nomeCampo.trim() || renomear.isPending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
```

- [ ] **Step 2: Registrar o item na tela de Configurações**

Em `src/app/(protected)/configuracoes/page.tsx`:

Adicionar `Tag` à lista de ícones importados (linha 5-9):

```typescript
import {
  Settings, Building2, Users, Layers, Smartphone, Calculator,
  Landmark, ClipboardCheck, Bot, LayoutTemplate, Percent, Target,
  Package, ChevronRight, ArrowLeft, ShieldCheck, Handshake, CalendarClock, Radio, Tag,
} from 'lucide-react'
```

Adicionar o import do componente (logo abaixo da linha 27):

```typescript
import { OrigensLeadConfig } from './_components/origens-lead/OrigensLeadConfig'
```

No grupo `'Comunicação & Automação'` (linhas 82-89), adicionar o item novo logo após `canais-captacao`:

```typescript
  {
    titulo: 'Comunicação & Automação',
    itens: [
      { key: 'instancias',   label: 'Instâncias WhatsApp', descricao: 'Números e instâncias conectadas ao sistema',            icon: Smartphone },
      { key: 'agente-fonti', label: 'Agente Fonti',        descricao: 'Comportamento do assistente virtual no WhatsApp',       icon: Bot },
      { key: 'recepcao',     label: 'Agenda & Recepção',   descricao: 'Usuário avisado quando um compromisso é na Sede',       icon: CalendarClock },
      { key: 'canais-captacao', label: 'Canais de Captação', descricao: 'Ative ou desative o recebimento de leads por site, Instagram e indicação', icon: Radio },
      { key: 'origens-leads',   label: 'Origens de Leads',   descricao: 'Gerencie as opções de origem exibidas em Captação',   icon: Tag },
    ],
  },
```

No `switch` de `renderConteudo` (linha 94+), adicionar o case logo após `'canais-captacao'`:

```typescript
    case 'canais-captacao':  return wrap('Canais de Captação', 'Ligue ou desligue o recebimento automático de leads por canal.', <CanaisCaptacaoConfig />)
    case 'origens-leads':    return wrap('Origens de Leads', 'Renomeie as origens automáticas e gerencie as manuais.', <OrigensLeadConfig />)
```

- [ ] **Step 3: Rodar `tsc`**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Testar manualmente no navegador**

Se este ambiente tiver acesso a um Supabase configurado (`.env.local` com credenciais reais): abrir `Configurações → Origens de Leads`, criar uma origem nova, renomear uma automática, desativar/reativar uma manual. Se não tiver, pular este step e reportar como pendência de QA manual do usuário.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(protected)/configuracoes/_components/origens-lead/OrigensLeadConfig.tsx" "src/app/(protected)/configuracoes/page.tsx"
git commit -m "feat: tela Configurações > Origens de Leads"
```

---

## Task 8: `AbaOportunidade.tsx` — dropdown de origem dinâmico

**Files:**
- Modify: `src/components/leads/LeadDetalhe/AbaOportunidade.tsx`

**Interfaces:**
- Consumes: `useOrigensLead()` (Task 4).

- [ ] **Step 1: Editar**

Adicionar o import (junto aos demais hooks, próximo à linha 20-24):

```typescript
import { useOrigensLead } from '@/hooks/leads/useOrigensLead'
```

Remover a constante `ORIGENS` fixa (linhas 47-59):

```typescript
const ORIGENS: { value: string; label: string }[] = [
  { value: 'indicacao',          label: 'Indicação' },
  { value: 'whatsapp',           label: 'WhatsApp' },
  { value: 'instagram',          label: 'Instagram' },
  { value: 'facebook',           label: 'Facebook' },
  { value: 'site',               label: 'Site' },
  { value: 'direto',             label: 'Direto' },
  { value: 'corretor',           label: 'Corretor' },
  { value: 'imobiliaria',        label: 'Imobiliária' },
  { value: 'construtora',        label: 'Construtora' },
  { value: 'parceiro_comercial', label: 'Parceiro Comercial' },
  { value: 'outros',             label: 'Outros' },
]
```

Trocar o schema zod (linhas 34-37) — `origem` deixa de ser `z.enum([...])`:

```typescript
  origem: z.string().min(1, 'Selecione uma origem'),
```

Dentro do componente, logo após a linha que chama `useLeadChecklist` (ou outro hook próximo ao topo do componente principal — a função que contém o `useForm` deste arquivo), adicionar:

```typescript
  const { data: origens = [] } = useOrigensLead()
```

No JSX, trocar o bloco do `SelectContent` da origem (linhas 205-208):

```typescript
                  <SelectContent>
                    {ORIGENS.map(o => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
```

por:

```typescript
                  <SelectContent>
                    {origens.map(o => (
                      <SelectItem key={o.id} value={o.codigo}>{o.nome}</SelectItem>
                    ))}
                  </SelectContent>
```

- [ ] **Step 2: Rodar `tsc`**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add "src/components/leads/LeadDetalhe/AbaOportunidade.tsx"
git commit -m "feat: dropdown de origem em AbaOportunidade usa catálogo dinâmico"
```

---

## Task 9: `AbaCredito.tsx` — dropdown de origem dinâmico

**Files:**
- Modify: `src/components/leads/LeadDetalhe/AbaCredito.tsx`

**Interfaces:**
- Consumes: `useOrigensLead()` (Task 4).

- [ ] **Step 1: Editar**

Adicionar o import no topo do arquivo (junto aos demais):

```typescript
import { useOrigensLead } from '@/hooks/leads/useOrigensLead'
```

Remover a constante `ORIGENS` (linhas 78-90):

```typescript
const ORIGENS = [
  { value: 'direto',             label: 'Direto' },
  { value: 'whatsapp',           label: 'WhatsApp' },
  { value: 'indicacao',          label: 'Indicação' },
  { value: 'corretor',           label: 'Corretor' },
  { value: 'imobiliaria',        label: 'Imobiliária' },
  { value: 'construtora',        label: 'Construtora' },
  { value: 'parceiro_comercial', label: 'Parceiro Comercial' },
  { value: 'site',               label: 'Site' },
  { value: 'instagram',          label: 'Instagram' },
  { value: 'facebook',           label: 'Facebook' },
  { value: 'outros',             label: 'Outros' },
]
```

Trocar o componente `BlocoOrigem` (linhas 1789-1803) — passa a chamar o
hook internamente em vez de usar a constante removida:

```typescript
function BlocoOrigem({ origem, onChange, saving }: {
  origem: Lead['origem']; onChange: (o: string) => void; saving: boolean
}) {
  const { data: origens = [] } = useOrigensLead()
  return (
    <div className="bg-white border border-gray-300 rounded-xl shadow p-4 space-y-3">
      <p className="text-[11px] font-bold text-fonti-primary uppercase tracking-widest border-b border-gray-100 pb-2 mb-1">Origem</p>
      <Select value={origem} onValueChange={onChange} disabled={saving}>
        <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
        <SelectContent>
          {origens.map(o => <SelectItem key={o.id} value={o.codigo}>{o.nome}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  )
}
```

(A chamada em `onChange={(o) => editar.mutate({ id: lead.id, origem: o as Lead['origem'] })}`,
linha ~260, não precisa mudar — `Lead['origem']` já é `string` após a Task 5.)

- [ ] **Step 2: Rodar `tsc`**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add "src/components/leads/LeadDetalhe/AbaCredito.tsx"
git commit -m "feat: dropdown de origem em AbaCredito usa catálogo dinâmico"
```

---

## Task 10: `LeadFormDrawer.tsx` — dropdown de origem dinâmico

**Files:**
- Modify: `src/components/leads/LeadFormDrawer.tsx`

**Interfaces:**
- Consumes: `useOrigensLead()` (Task 4).

**Nota de contexto**: este arquivo hoje só lista 6 das 11 origens no dropdown
(`indicacao`, `site`, `whatsapp`, `instagram`, `facebook`, `outros` — falta
`direto`/`corretor`/`imobiliaria`/`construtora`/`parceiro_comercial`), uma
inconsistência pré-existente não relacionada a este plano. Trocar pelo
catálogo dinâmico corrige isso de brinde, sem esforço extra.

- [ ] **Step 1: Editar**

Adicionar o import:

```typescript
import { useOrigensLead } from '@/hooks/leads/useOrigensLead'
```

Trocar o schema zod (linha 38):

```typescript
  origem: z.enum(['indicacao', 'site', 'whatsapp', 'instagram', 'facebook', 'outros', 'direto', 'corretor', 'imobiliaria', 'construtora', 'parceiro_comercial']),
```

por:

```typescript
  origem: z.string().min(1, 'Selecione uma origem'),
```

Dentro do componente, próximo ao topo (junto a outras chamadas de hook),
adicionar:

```typescript
  const { data: origens = [] } = useOrigensLead()
```

Trocar o `SelectContent` (linhas 242-249):

```typescript
                      <SelectContent>
                        <SelectItem value="indicacao">Indicação</SelectItem>
                        <SelectItem value="site">Site</SelectItem>
                        <SelectItem value="whatsapp">WhatsApp</SelectItem>
                        <SelectItem value="instagram">Instagram</SelectItem>
                        <SelectItem value="facebook">Facebook</SelectItem>
                        <SelectItem value="outros">Outros</SelectItem>
                      </SelectContent>
```

por:

```typescript
                      <SelectContent>
                        {origens.map((o) => (
                          <SelectItem key={o.id} value={o.codigo}>{o.nome}</SelectItem>
                        ))}
                      </SelectContent>
```

- [ ] **Step 2: Rodar `tsc`**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/components/leads/LeadFormDrawer.tsx
git commit -m "feat: dropdown de origem em LeadFormDrawer usa catálogo dinâmico (corrige lacuna de 5 opções faltando)"
```

---

## Task 11: `LeadEditarModal.tsx` — dropdown de origem dinâmico

**Files:**
- Modify: `src/components/leads/LeadEditarModal.tsx`

**Interfaces:**
- Consumes: `useOrigensLead()` (Task 4).

**Nota de contexto**: mesma lacuna pré-existente do Task 10 — este arquivo
só lista 6 das 11 origens hoje.

- [ ] **Step 1: Editar**

Adicionar o import:

```typescript
import { useOrigensLead } from '@/hooks/leads/useOrigensLead'
```

Trocar o schema zod (linha 47):

```typescript
  origem:         z.enum(['indicacao', 'site', 'whatsapp', 'instagram', 'facebook', 'outros', 'direto', 'corretor', 'imobiliaria', 'construtora', 'parceiro_comercial']),
```

por:

```typescript
  origem:         z.string().min(1, 'Selecione uma origem'),
```

Dentro do componente, próximo ao topo, adicionar:

```typescript
  const { data: origens = [] } = useOrigensLead()
```

Trocar o `SelectContent` (linhas 399-406):

```typescript
                      <SelectContent>
                        <SelectItem value="indicacao">Indicação</SelectItem>
                        <SelectItem value="whatsapp">WhatsApp</SelectItem>
                        <SelectItem value="instagram">Instagram</SelectItem>
                        <SelectItem value="facebook">Facebook</SelectItem>
                        <SelectItem value="site">Site</SelectItem>
                        <SelectItem value="outros">Outros</SelectItem>
                      </SelectContent>
```

por:

```typescript
                      <SelectContent>
                        {origens.map((o) => (
                          <SelectItem key={o.id} value={o.codigo}>{o.nome}</SelectItem>
                        ))}
                      </SelectContent>
```

- [ ] **Step 2: Rodar `tsc`**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/components/leads/LeadEditarModal.tsx
git commit -m "feat: dropdown de origem em LeadEditarModal usa catálogo dinâmico (corrige lacuna de 5 opções faltando)"
```

---

## Task 12: `NovoProcessoModal.tsx` — `fmtOrigem` usa o catálogo

**Files:**
- Modify: `src/components/leads/NovoProcessoModal.tsx`

**Interfaces:**
- Consumes: `useOrigensLead()` (Task 4).

**Contexto**: este arquivo não tem dropdown editável de origem — só exibe o
valor herdado do Lead (read-only) via a função `fmtOrigem`, hoje com um
mapa hardcoded parcial (6 de 11 valores). Vira consistente com o resto do
catálogo, e passa a refletir renomeações feitas em Configurações.

- [ ] **Step 1: Editar**

Adicionar o import:

```typescript
import { useOrigensLead } from '@/hooks/leads/useOrigensLead'
```

`fmtOrigem` (linhas 107-110) é uma função solta no módulo, usada dentro do
componente `ParceiroBadge` (que recebe `lead` via props). Trocar para
receber a lista de origens como parâmetro, e resolver `ParceiroBadge` para
chamar o hook e repassar:

```typescript
function fmtOrigem(origem: string, origens: { codigo: string; nome: string }[]) {
  return origens.find((o) => o.codigo === origem)?.nome ?? origem
}
```

No componente `ParceiroBadge` (a partir da linha 113), adicionar a chamada
do hook e repassar nas duas chamadas de `fmtOrigem` dentro dele (linha 136
e qualquer outra ocorrência dentro do mesmo componente):

```typescript
function ParceiroBadge({ lead }: { lead: Lead | null }) {
  const { data: origens = [] } = useOrigensLead()
  if (!lead?.parceiro && !lead?.origem && !lead?.campanha) return null
  return (
    <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm space-y-0.5">
      {/* ... */}
      {lead.origem && (
        <p className="text-blue-800">
          <span className="text-blue-500">Origem:</span>{' '}
          <span className="font-medium">{fmtOrigem(lead.origem, origens)}</span>
        </p>
      )}
      {/* ... */}
    </div>
  )
}
```

`fmtOrigem` também é chamada em `SeletorTipo` (componente separado, por
volta da linha 442):

```typescript
              {lead.origem === 'whatsapp' && <MessageCircle className="h-3 w-3 text-green-500" />}
              {fmtOrigem(lead.origem)}
```

Adicionar o hook dentro de `SeletorTipo` também (logo após a desestruturação
de props, junto a `clienteNome`/`clienteCpf`) e passar `origens` como
segundo argumento nessa chamada:

```typescript
function SeletorTipo({ lead, pessoa, onSelecionar, onFechar }: {
  lead: Lead | null
  pessoa?: PessoaMinima | null
  onSelecionar: (t: TipoProcesso) => void
  onFechar: () => void
}) {
  const { data: origens = [] } = useOrigensLead()
  const clienteNome = lead?.nome ?? pessoa?.nome ?? '—'
  const clienteCpf  = lead?.cpf  ?? pessoa?.cpf  ?? null
  // ...
              {lead.origem === 'whatsapp' && <MessageCircle className="h-3 w-3 text-green-500" />}
              {fmtOrigem(lead.origem, origens)}
```

Confirmar por busca textual (`fmtOrigem(`) que não sobrou nenhuma chamada
passando só um argumento antes de seguir pro próximo step — essas são as
únicas 2 ocorrências no arquivo.

- [ ] **Step 2: Rodar `tsc`**

Run: `npx tsc --noEmit`
Expected: 0 erros — este é o último arquivo do plano.

- [ ] **Step 3: Commit**

```bash
git add src/components/leads/NovoProcessoModal.tsx
git commit -m "feat: NovoProcessoModal exibe nome de origem via catálogo dinâmico"
```

---

## Task 13: Verificação final

**Files:** nenhum (só validação)

- [ ] **Step 1: Suíte completa**

Run: `npx tsc --noEmit && npm run test`
Expected: `tsc` limpo (0 erros). `npm run test`: sem regressão nas suítes
que existiam antes deste plano (comparar contagem de falhas/passando antes
e depois — qualquer falha nova precisa ser investigada; falhas
pré-existentes e não relacionadas a leads/origem/configurações não são
responsabilidade deste plano).

- [ ] **Step 2: QA manual (se houver acesso a um Supabase configurado neste ambiente; senão, pendência do usuário)**

1. `Configurações → Origens de Leads`: renomear "WhatsApp" → "WhatsApp Business", confirmar que o badge de origem em um lead que já tem `origem='whatsapp'` reflete o novo nome.
2. Criar uma origem manual nova ("Feira de Imóveis") → confirmar que aparece nas 4 telas com dropdown editável (Oportunidade, Crédito, Novo Lead via `LeadFormDrawer`, Editar Lead via `LeadEditarModal`).
3. Desativar uma origem manual (`Outros`, por exemplo) → confirmar que some do dropdown de novas seleções, mas um lead antigo com essa origem continua exibindo o nome corretamente.
4. Confirmar que o botão de desativar não aparece nas 5 origens automáticas (só o de renomear).
5. Testar que um lead criado via webhook (ex: mandar mensagem de teste pro WhatsApp do bot, se disponível) continua criando o Lead com `origem='whatsapp'` normalmente, sem erro.

- [ ] **Step 3: Reportar ao usuário**

Resumir o que foi testado e pedir para o usuário validar o fluxo em
produção — em especial os pontos que não puderam ser testados neste
ambiente por falta de acesso a um banco Supabase real (migrations e QA
manual em navegador).
