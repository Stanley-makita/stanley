# Participantes V2 — Fase B1 (leitores) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Todos os leitores de lista/identidade (Negócio, tarefas, agenda, documentos, bot, busca, Captação e 9 funções SQL de relatório) passam a ler participantes de `participacoes` + `pessoas`, deixando de ler `processo_compradores`/`processo_vendedores`/`lead_vendedores`/campos `conjuge_*` do lead — sem mudar nenhuma escrita.

**Architecture:** A Fase A (PR #353, em produção desde 2026-09-30) mantém `participacoes`/`pessoa_relacionamentos` sincronizadas a partir do modelo antigo por triggers. Enquanto a sincronização existir, ler do modelo novo dá o mesmo resultado que ler do antigo — então os leitores podem migrar agora, sem janela de risco, e a Fase B2 (troca de escrita) fica menor. Um adaptador puro (`src/lib/participantes/resumo.ts`) converte o embed de participações no mesmo formato que as telas já usam (`processo.compradores`/`vendedores`: `id, nome, cpf, principal, pessoa_id`), então os ~15 componentes que só leem esses campos não mudam.

**Tech Stack:** Next.js 14 (App Router), supabase-js 2.103 (PostgREST embeds), React Query, Vitest, PostgreSQL (Supabase; SQL rodado manualmente pelo usuário no SQL Editor).

**Spec:** `docs/superpowers/specs/2026-09-28-participantes-v2-design.md` (seções 1, 4 e 6 — Fase B, item "migram na Fase B, antes das colunas virarem `_legado`").

## Fase B em três etapas (contexto — só a B1 está neste plano)

A sincronização da Fase A (`pv2_gravar_participacoes`) **reconstrói** as participações de uma proposta a partir das tabelas antigas a cada edição feita pela tela antiga (apaga o que não está no modelo antigo). Consequência: nenhuma tela pode começar a gravar direto em `participacoes` enquanto a sincronização existir — a próxima edição pela tela antiga apagaria a gravação. Por isso:

| Etapa | O que faz | Publicação |
|---|---|---|
| **B1 — leitores (este plano)** | Leitores de nome/CPF/lista/papel passam para o modelo novo. Nenhuma escrita muda. | PR próprio, a qualquer hora (migration 328 fora do horário comercial) |
| **B2 — troca de escrita** | `ParticipantesProposta` (Lead e Negócio), rotas `/api/participacoes` e `/api/relacionamentos`, OCR "De quem é este documento?", certidão de casamento, "Mover para participante", conversão lead → negócio por participações, `*cria cliente`/`*salva` por participante, comunicação (interessados/atualizar-cliente, hoje presos a `processo_compradores.id`), Clicksign/e-mail de confirmação (e-mail/telefone), overlay de `dados.ts` removido, contratos. Migration que **desliga a sincronização**, deixa `leads.pessoa_id` derivado e faz as tabelas antigas **rejeitarem escrita** (qualquer escritor esquecido falha alto em vez de divergir em silêncio). | Um único deploy (código + migration), plano próprio |
| **B3 — limpeza (+30 dias)** | Colunas/tabelas antigas → `_legado`, depois `DROP`; remove `fn_sincronizar_pessoa_conjuge` e código morto; CLAUDE.md. | Plano próprio |

**Fica fora da B1 de propósito (vai para a B2):** leitores de **e-mail/telefone** (Clicksign `enviar`, prévia do e-mail de confirmação de valores, interessados/atualizar-cliente, overlay de `src/lib/formularios/dados.ts`). Motivo verificado no código: `useAdicionarComprador` (`src/hooks/processos/useProcessoCompradores.ts:44-60`) grava e-mail/telefone digitados **só** em `processo_compradores` na inclusão; só a edição posterior copia para a Pessoa. Ler da Pessoa antes da B2 perderia esses valores. Também ficam para a B2 os componentes que **escrevem** no modelo antigo (AbaPessoa, AbaCredito, AbaCompradores/AbaVendedores do Negócio, NovoProcessoModal, CompletarDadosPessoaDrawer, página da Pessoa, `resolver-pessoa` de contratos, merge de pessoas) e os contratos (`src/lib/contratos/*` tem trabalho não commitado do fix do timeout 504 no checkout principal — não tocar).

## Global Constraints

- Trabalho na worktree `.claude/worktrees/participantes-v2`, branch `feat/participantes-v2-fase-b1` (criado a partir de `main` @ 9375104). Nunca tocar no checkout principal (`C:/Users/Marci/Downloads/openclau/squads/credifon-crm` fora de `.claude/worktrees/...`), nunca `git stash`. Implementadores nunca dão push; push/PR só na entrega (Task 6), feitos pelo controlador.
- Papéis: compra `titular | coparticipante | conjuge_anuente`; venda `vendedor | conjuge_vendedor` (`PAPEIS_COMPRA`/`PAPEIS_VENDA` de `src/lib/participantes/tipos.ts`).
- Nome/CPF sempre de `pessoas` (Participação nunca copia dado da Pessoa).
- Toda query em `pessoas` filtra `deleted_at IS NULL` (exceto relatórios históricos de negócio já emitido — ver Task 5); toda consulta supabase-js olha `error`, não só `data`.
- Query nova num caminho do bot que responde ao operador tem timeout (`.abortSignal(AbortSignal.timeout(10000))`) — regra do CLAUDE.md.
- Nenhuma escrita muda nesta etapa: nenhum `insert/update/delete/upsert` novo e nenhum removido.
- Migration: `supabase/migrations/20261003_328_participantes_v2_leitores_sql.sql` + diagnóstico `supabase/2026-10-03_equivalencia_leitores_participantes_v2.sql`. Não há banco para agentes: SQL é revisado estaticamente; o usuário roda. Ao terminar, copiar os dois `.sql` para `supabase/` e `supabase/migrations/` da raiz do repo principal (regra do CLAUDE.md do projeto) — só esse passo toca o checkout principal, e só adicionando esses dois arquivos.
- Testes TS: `node ../../../node_modules/vitest/vitest.mjs run --dir src --exclude ".claude/**" --exclude "output/**" <arquivo>` a partir da worktree. Falhas pré-existentes (não são desta tarefa): `src/app/api/leads/[id]/atualizar-cliente/__tests__/route.test.ts`, `src/app/api/processos/[id]/atualizar-cliente/__tests__/route.test.ts`, `src/lib/simuladorFinanciamento/__tests__/criteria-migracao-fase4-caixa.test.ts`, `src/lib/workflows/__tests__/mensagem-imovel-acima-teto.test.ts`, `src/lib/workflows/__tests__/prazo-idade-renda-maxima.test.ts`.
- Tipos: `node ../../../node_modules/typescript/bin/tsc --noEmit -p .` — só conta erro fora de `output/`.
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Negócio sem titular** (3 em produção: 1 Pessoa excluída, 2 pessoas de operador) → listas mostram o 1º participante de compra, senão `nome_imovel`; relatórios caem em `processos.pessoa_id` (`COALESCE(pc.nome, pe.nome, '')`); upload/formulário não escolhem dono errado (devolvem null → mensagem de erro já existente). Teste: Task 1 (`compradoresDaProposta` sem titular; `titularDaProposta` → null).
2. **Pessoa excluída (soft delete) com participação antiga** (a sincronização não observa exclusão de Pessoa) → nunca aparece em lista, nunca é dona de upload/formulário. Teste: Task 1.
3. **Cônjuge anuente na lista de compradores do Negócio** → aparece com rótulo "Cônjuge" e nunca como "Principal". Teste: Task 1 (`principal` só para titular) + Task 2 (render).
4. **Nome da Pessoa diferente do nome copiado em `processo_compradores`** → passa a valer o da Pessoa (intencional; Pessoa é a fonte). Diagnóstico de equivalência da Task 5 lista todas as divergências antes de rodar a 328.
5. **Lead com vendedor só em campo solto** (`leads.vendedor_nome` sem Pessoa) → lista de leads continua mostrando `vendedor_nome` (fallback já existente em `LeadListView.tsx:121,969`). Teste: Task 1 (`comoLeadVendedores([])` → `[]`, fallback preservado).

---

### Task 1: Adaptador de listas + consultas por proposta

**Files:**
- Modify: `src/lib/participantes/tipos.ts` (adicionar `ParticipanteLista` e `ROTULO_PAPEL`)
- Create: `src/lib/participantes/resumo.ts`
- Create: `src/lib/participantes/consultas.ts`
- Test: `src/lib/participantes/__tests__/resumo.test.ts`, `src/lib/participantes/__tests__/consultas.test.ts`

**Interfaces:**
- Consumes: `PapelParticipacao`, `PAPEIS_COMPRA`, `PropostaRef` (`src/lib/participantes/tipos.ts`); `criarFakeDb` (`src/lib/documentos/__tests__/helpers/fakeDb.ts` — suporta `select/eq/in/is/not/limit/abortSignal/maybeSingle/then`).
- Produces:
  - `interface ParticipanteLista { id: string; pessoa_id: string; nome: string; cpf: string | null; papel: PapelParticipacao; principal: boolean }` (em `tipos.ts`)
  - `const ROTULO_PAPEL: Record<PapelParticipacao, string>` (em `tipos.ts`)
  - `const EMBED_PARTICIPANTES: string` — `'participantes:participacoes(id, papel, ordem, pessoa:pessoas!pessoa_id(id, nome, cpf, deleted_at))'`
  - `type ParticipacaoEmbed = { id: string; papel: PapelParticipacao; ordem: number; pessoa: PessoaEmbed | PessoaEmbed[] | null }`
  - `compradoresDaProposta(parts: ParticipacaoEmbed[] | null | undefined): ParticipanteLista[]`
  - `vendedoresDaProposta(parts: ParticipacaoEmbed[] | null | undefined): ParticipanteLista[]`
  - `nomeTitular(parts: ParticipacaoEmbed[] | null | undefined): string | null`
  - `comListasDeParticipantes<T extends { participantes?: ParticipacaoEmbed[] | null }>(row: T): Omit<T, 'participantes'> & { compradores: ParticipanteLista[]; vendedores: ParticipanteLista[] }`
  - `comoLeadVendedores(parts): Array<{ id: string; pessoa_id: string; pessoa: { id: string; nome: string; cpf: string | null } }>`
  - `pessoasDaProposta(sb: SupabaseClient, ref: PropostaRef, papeis: readonly PapelParticipacao[], opts?: { timeoutMs?: number }): Promise<string[]>`
  - `titularDaProposta(sb: SupabaseClient, ref: PropostaRef, opts?: { timeoutMs?: number }): Promise<{ pessoa_id: string; nome: string; cpf: string | null } | null>`
  - `processosDaPessoa(sb: SupabaseClient, empresaId: string, pessoaId: string, papeis: readonly PapelParticipacao[], opts?: { timeoutMs?: number }): Promise<string[]>`

- [ ] **Step 1: Escrever os testes do adaptador**

`src/lib/participantes/__tests__/resumo.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  compradoresDaProposta, vendedoresDaProposta, nomeTitular, comListasDeParticipantes, comoLeadVendedores,
  type ParticipacaoEmbed,
} from '../resumo'

const p = (id: string, nome: string, extra: Record<string, unknown> = {}) => ({ id, nome, cpf: null, deleted_at: null, ...extra })

const heitor:  ParticipacaoEmbed = { id: 'pa1', papel: 'titular',         ordem: 1, pessoa: p('h', 'Heitor', { cpf: '52998224725' }) }
const afranio: ParticipacaoEmbed = { id: 'pa2', papel: 'coparticipante',  ordem: 3, pessoa: [p('a', 'Afrânio')] }
const maria:   ParticipacaoEmbed = { id: 'pa3', papel: 'conjuge_anuente', ordem: 2, pessoa: p('m', 'Maria') }
const vend:    ParticipacaoEmbed = { id: 'pa4', papel: 'vendedor',        ordem: 1, pessoa: p('v', 'Vera') }
const cvend:   ParticipacaoEmbed = { id: 'pa5', papel: 'conjuge_vendedor', ordem: 2, pessoa: p('cv', 'Caio') }

describe('compradoresDaProposta', () => {
  it('titular primeiro, depois ordem; só papéis de compra; embed em array ou objeto', () => {
    const r = compradoresDaProposta([afranio, vend, maria, heitor])
    expect(r.map(c => c.nome)).toEqual(['Heitor', 'Maria', 'Afrânio'])
    expect(r[0]).toEqual({ id: 'pa1', pessoa_id: 'h', nome: 'Heitor', cpf: '52998224725', papel: 'titular', principal: true })
  })
  it('principal só para o titular (cônjuge anuente nunca é principal)', () => {
    const r = compradoresDaProposta([heitor, maria])
    expect(r.find(c => c.papel === 'conjuge_anuente')?.principal).toBe(false)
  })
  it('sem titular: devolve os demais compradores, nenhum principal', () => {
    const r = compradoresDaProposta([afranio, maria])
    expect(r.map(c => c.nome)).toEqual(['Maria', 'Afrânio'])
    expect(r.some(c => c.principal)).toBe(false)
  })
  it('ignora Pessoa excluída (soft delete) e embed nulo', () => {
    const excluida: ParticipacaoEmbed = { id: 'pa9', papel: 'titular', ordem: 1, pessoa: p('x', 'Excluída', { deleted_at: '2026-09-01' }) }
    const nula: ParticipacaoEmbed = { id: 'pa8', papel: 'coparticipante', ordem: 2, pessoa: null }
    expect(compradoresDaProposta([excluida, nula, afranio]).map(c => c.nome)).toEqual(['Afrânio'])
  })
  it('entrada vazia/nula', () => {
    expect(compradoresDaProposta(null)).toEqual([])
    expect(compradoresDaProposta(undefined)).toEqual([])
  })
})

describe('vendedoresDaProposta', () => {
  it('só papel vendedor (cônjuge do vendedor só assina, não é listado como vendedor)', () => {
    expect(vendedoresDaProposta([heitor, vend, cvend]).map(v => v.nome)).toEqual(['Vera'])
  })
})

describe('nomeTitular', () => {
  it('nome do titular; sem titular, o 1º comprador; sem ninguém, null', () => {
    expect(nomeTitular([maria, heitor])).toBe('Heitor')
    expect(nomeTitular([afranio])).toBe('Afrânio')
    expect(nomeTitular([vend])).toBeNull()
    expect(nomeTitular(null)).toBeNull()
  })
})

describe('comListasDeParticipantes', () => {
  it('troca participantes por compradores/vendedores e preserva o resto da linha', () => {
    const r = comListasDeParticipantes({ id: 'proc1', nome_imovel: 'Apto', participantes: [heitor, vend] })
    expect(r).toEqual({
      id: 'proc1', nome_imovel: 'Apto',
      compradores: [{ id: 'pa1', pessoa_id: 'h', nome: 'Heitor', cpf: '52998224725', papel: 'titular', principal: true }],
      vendedores: [{ id: 'pa4', pessoa_id: 'v', nome: 'Vera', cpf: null, papel: 'vendedor', principal: false }],
    })
    expect('participantes' in r).toBe(false)
  })
})

describe('comoLeadVendedores', () => {
  it('formato LeadVendedor (id, pessoa_id, pessoa{id,nome,cpf}); vazio quando não há vendedor', () => {
    expect(comoLeadVendedores([heitor, vend])).toEqual([{ id: 'pa4', pessoa_id: 'v', pessoa: { id: 'v', nome: 'Vera', cpf: null } }])
    expect(comoLeadVendedores([])).toEqual([])
  })
})
```

- [ ] **Step 2: Escrever os testes das consultas**

`src/lib/participantes/__tests__/consultas.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { criarFakeDb } from '@/lib/documentos/__tests__/helpers/fakeDb'
import { pessoasDaProposta, titularDaProposta, processosDaPessoa } from '../consultas'
import { PAPEIS_COMPRA, PAPEIS_VENDA } from '../tipos'

const base = () => criarFakeDb({
  participacoes: [
    { empresa_id: 'e1', processo_id: 'pr1', lead_id: null, pessoa_id: 'h', papel: 'titular' },
    { empresa_id: 'e1', processo_id: 'pr1', lead_id: null, pessoa_id: 'm', papel: 'conjuge_anuente' },
    { empresa_id: 'e1', processo_id: 'pr1', lead_id: null, pessoa_id: 'v', papel: 'vendedor' },
    { empresa_id: 'e1', processo_id: null, lead_id: 'l1', pessoa_id: 'h', papel: 'titular' },
    { empresa_id: 'e1', processo_id: 'pr2', lead_id: null, pessoa_id: 'h', papel: 'vendedor' },
    { empresa_id: 'e1', processo_id: 'pr3', lead_id: null, pessoa_id: 'x', papel: 'titular' },
  ],
  pessoas: [
    { id: 'h', nome: 'Heitor', cpf: '52998224725', deleted_at: null },
    { id: 'm', nome: 'Maria', cpf: null, deleted_at: null },
    { id: 'v', nome: 'Vera', cpf: null, deleted_at: null },
    { id: 'x', nome: 'Excluída', cpf: null, deleted_at: '2026-09-01' },
  ],
})

// Stub mínimo que devolve erro do Supabase (fakeDb não simula erro).
const comErro = { from: () => { const c: Record<string, unknown> = {}; for (const m of ['select', 'eq', 'in', 'is', 'not', 'abortSignal']) c[m] = () => c
  c.maybeSingle = () => Promise.resolve({ data: null, error: { message: 'boom' } })
  c.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: null, error: { message: 'boom' } }).then(res)
  return c } }

describe('pessoasDaProposta', () => {
  it('filtra pela proposta e pelos papéis', async () => {
    const db = base()
    expect(await pessoasDaProposta(db as never, { tipo: 'processo', id: 'pr1' }, PAPEIS_COMPRA)).toEqual(['h', 'm'])
    expect(await pessoasDaProposta(db as never, { tipo: 'processo', id: 'pr1' }, PAPEIS_VENDA)).toEqual(['v'])
    expect(await pessoasDaProposta(db as never, { tipo: 'lead', id: 'l1' }, PAPEIS_VENDA)).toEqual([])
  })
  it('erro do banco vira exceção (nunca lista vazia silenciosa)', async () => {
    await expect(pessoasDaProposta(comErro as never, { tipo: 'processo', id: 'pr1' }, PAPEIS_COMPRA)).rejects.toThrow('participacoes: boom')
  })
})

describe('titularDaProposta', () => {
  it('Pessoa do titular', async () => {
    expect(await titularDaProposta(base() as never, { tipo: 'processo', id: 'pr1' }))
      .toEqual({ pessoa_id: 'h', nome: 'Heitor', cpf: '52998224725' })
  })
  it('titular excluído (soft delete) → null', async () => {
    expect(await titularDaProposta(base() as never, { tipo: 'processo', id: 'pr3' })).toBeNull()
  })
  it('sem titular → null', async () => {
    expect(await titularDaProposta(base() as never, { tipo: 'processo', id: 'nao-existe' })).toBeNull()
  })
  it('erro do banco vira exceção', async () => {
    await expect(titularDaProposta(comErro as never, { tipo: 'processo', id: 'pr1' })).rejects.toThrow('participacoes: boom')
  })
})

describe('processosDaPessoa', () => {
  it('só processos (nunca lead) e só os papéis pedidos', async () => {
    const db = base()
    expect(await processosDaPessoa(db as never, 'e1', 'h', PAPEIS_COMPRA)).toEqual(['pr1'])
    expect(await processosDaPessoa(db as never, 'e1', 'h', PAPEIS_VENDA)).toEqual(['pr2'])
    expect(await processosDaPessoa(db as never, 'e2', 'h', PAPEIS_COMPRA)).toEqual([])
  })
})
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `node ../../../node_modules/vitest/vitest.mjs run --dir src --exclude ".claude/**" --exclude "output/**" src/lib/participantes/__tests__/resumo.test.ts src/lib/participantes/__tests__/consultas.test.ts`
Expected: FAIL — `Failed to resolve import "../resumo"` / `"../consultas"`.

- [ ] **Step 4: Tipos**

Acrescentar ao fim de `src/lib/participantes/tipos.ts`:

```ts
/** Participante no formato de lista — compatível com o antigo `processo.compradores`/`vendedores`
 *  (`id`, `nome`, `cpf`, `principal`, `pessoa_id`). `id` é o da participação (chave de lista). */
export interface ParticipanteLista {
  id: string
  pessoa_id: string
  nome: string
  cpf: string | null
  papel: PapelParticipacao
  /** true só para o titular (equivale ao antigo processo_compradores.principal). */
  principal: boolean
}

export const ROTULO_PAPEL: Record<PapelParticipacao, string> = {
  titular: 'Titular',
  coparticipante: 'Coparticipante',
  conjuge_anuente: 'Cônjuge',
  vendedor: 'Vendedor',
  conjuge_vendedor: 'Cônjuge do vendedor',
}
```

- [ ] **Step 5: Adaptador**

`src/lib/participantes/resumo.ts`:

```ts
import { PAPEIS_COMPRA, type PapelParticipacao, type ParticipanteLista } from './tipos'

/**
 * Embed PostgREST das participações de um lead/processo com o mínimo da Pessoa para listas,
 * cabeçalhos e buscas. Uso: `.select(\`*, ${EMBED_PARTICIPANTES}\`)` em `processos`/`leads`,
 * ou aninhado (`processo:processos!processo_id(id, ${EMBED_PARTICIPANTES})`).
 * Nome/CPF sempre da Pessoa — nunca de processo_compradores/processo_vendedores/lead_vendedores.
 */
export const EMBED_PARTICIPANTES =
  'participantes:participacoes(id, papel, ordem, pessoa:pessoas!pessoa_id(id, nome, cpf, deleted_at))'

type PessoaEmbed = { id: string; nome: string | null; cpf: string | null; deleted_at?: string | null }

export type ParticipacaoEmbed = {
  id: string
  papel: PapelParticipacao
  ordem: number
  pessoa: PessoaEmbed | PessoaEmbed[] | null
}

// Mesma prioridade de carregarParticipantes (carregar.ts): titular antes, o resto pela ordem.
const PRIORIDADE: Record<PapelParticipacao, number> = {
  titular: 0, coparticipante: 1, conjuge_anuente: 1, vendedor: 0, conjuge_vendedor: 1,
}

function lista(parts: ParticipacaoEmbed[] | null | undefined, papeis: readonly PapelParticipacao[]): ParticipanteLista[] {
  return (parts ?? [])
    .map(pa => ({ pa, pessoa: Array.isArray(pa.pessoa) ? (pa.pessoa[0] ?? null) : pa.pessoa }))
    // Pessoa excluída (soft delete) nunca aparece: a sincronização não observa exclusão de Pessoa.
    .filter((x): x is { pa: ParticipacaoEmbed; pessoa: PessoaEmbed } => papeis.includes(x.pa.papel) && !!x.pessoa && !x.pessoa.deleted_at)
    .sort((a, b) => PRIORIDADE[a.pa.papel] - PRIORIDADE[b.pa.papel] || a.pa.ordem - b.pa.ordem)
    .map(({ pa, pessoa }) => ({
      id: pa.id,
      pessoa_id: pessoa.id,
      nome: pessoa.nome ?? '',
      cpf: pessoa.cpf ?? null,
      papel: pa.papel,
      principal: pa.papel === 'titular',
    }))
}

/** Lado da compra (titular, coparticipantes, cônjuges anuentes), titular primeiro. */
export function compradoresDaProposta(parts: ParticipacaoEmbed[] | null | undefined): ParticipanteLista[] {
  return lista(parts, PAPEIS_COMPRA)
}

/** Só quem vende (papel 'vendedor'); o cônjuge do vendedor só assina e não entra na lista. */
export function vendedoresDaProposta(parts: ParticipacaoEmbed[] | null | undefined): ParticipanteLista[] {
  return lista(parts, ['vendedor'])
}

/** Nome do titular; sem titular (ex.: Pessoa excluída), o 1º comprador; sem ninguém, null. */
export function nomeTitular(parts: ParticipacaoEmbed[] | null | undefined): string | null {
  return compradoresDaProposta(parts)[0]?.nome || null
}

/** Troca o embed `participantes` pelas listas `compradores`/`vendedores` que as telas já usam. */
export function comListasDeParticipantes<T extends { participantes?: ParticipacaoEmbed[] | null }>(
  row: T,
): Omit<T, 'participantes'> & { compradores: ParticipanteLista[]; vendedores: ParticipanteLista[] } {
  const { participantes, ...resto } = row
  return { ...resto, compradores: compradoresDaProposta(participantes), vendedores: vendedoresDaProposta(participantes) }
}

/** Vendedores no formato `LeadVendedor` (src/types/leads.ts) — lista de leads. */
export function comoLeadVendedores(parts: ParticipacaoEmbed[] | null | undefined) {
  return vendedoresDaProposta(parts).map(v => ({
    id: v.id, pessoa_id: v.pessoa_id, pessoa: { id: v.pessoa_id, nome: v.nome, cpf: v.cpf },
  }))
}
```

- [ ] **Step 6: Consultas**

`src/lib/participantes/consultas.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { PapelParticipacao, PropostaRef } from './tipos'

type Opcoes = { timeoutMs?: number }
const coluna = (ref: PropostaRef) => (ref.tipo === 'lead' ? 'lead_id' : 'processo_id')

/** pessoa_id dos participantes da proposta com um dos papéis. Lança se a consulta falhar. */
export async function pessoasDaProposta(
  sb: SupabaseClient, ref: PropostaRef, papeis: readonly PapelParticipacao[], opts: Opcoes = {},
): Promise<string[]> {
  let q = sb.from('participacoes').select('pessoa_id').eq(coluna(ref), ref.id).in('papel', [...papeis])
  if (opts.timeoutMs) q = q.abortSignal(AbortSignal.timeout(opts.timeoutMs))
  const { data, error } = await q
  if (error) throw new Error(`participacoes: ${error.message}`)
  return Array.from(new Set(((data ?? []) as Array<{ pessoa_id: string }>).map(r => r.pessoa_id)))
}

export interface TitularProposta { pessoa_id: string; nome: string; cpf: string | null }

/**
 * Pessoa ativa do titular da proposta. null quando não há titular — casos reais: titular
 * excluído (soft delete) ou Pessoa de operador (nunca vira participante). Lança se a consulta falhar.
 */
export async function titularDaProposta(sb: SupabaseClient, ref: PropostaRef, opts: Opcoes = {}): Promise<TitularProposta | null> {
  let q = sb.from('participacoes').select('pessoa_id').eq(coluna(ref), ref.id).eq('papel', 'titular')
  if (opts.timeoutMs) q = q.abortSignal(AbortSignal.timeout(opts.timeoutMs))
  const { data: part, error } = await q.maybeSingle()
  if (error) throw new Error(`participacoes: ${error.message}`)
  if (!part) return null

  let qp = sb.from('pessoas').select('id, nome, cpf').eq('id', (part as { pessoa_id: string }).pessoa_id).is('deleted_at', null)
  if (opts.timeoutMs) qp = qp.abortSignal(AbortSignal.timeout(opts.timeoutMs))
  const { data: pessoa, error: eP } = await qp.maybeSingle()
  if (eP) throw new Error(`pessoas: ${eP.message}`)
  if (!pessoa) return null
  const pe = pessoa as { id: string; nome: string | null; cpf: string | null }
  return { pessoa_id: pe.id, nome: pe.nome ?? '', cpf: pe.cpf ?? null }
}

/** processo_id onde a Pessoa participa com um dos papéis (nunca devolve lead). Lança se a consulta falhar. */
export async function processosDaPessoa(
  sb: SupabaseClient, empresaId: string, pessoaId: string, papeis: readonly PapelParticipacao[], opts: Opcoes = {},
): Promise<string[]> {
  let q = sb.from('participacoes').select('processo_id')
    .eq('empresa_id', empresaId).eq('pessoa_id', pessoaId).in('papel', [...papeis]).not('processo_id', 'is', null)
  if (opts.timeoutMs) q = q.abortSignal(AbortSignal.timeout(opts.timeoutMs))
  const { data, error } = await q
  if (error) throw new Error(`participacoes: ${error.message}`)
  return Array.from(new Set(((data ?? []) as Array<{ processo_id: string }>).map(r => r.processo_id)))
}
```

- [ ] **Step 7: Rodar e ver passar**

Run: `node ../../../node_modules/vitest/vitest.mjs run --dir src --exclude ".claude/**" --exclude "output/**" src/lib/participantes`
Expected: PASS (todos os arquivos de `src/lib/participantes/__tests__`, inclusive os da Fase A).

- [ ] **Step 8: Commit**

```bash
git add src/lib/participantes/tipos.ts src/lib/participantes/resumo.ts src/lib/participantes/consultas.ts src/lib/participantes/__tests__/resumo.test.ts src/lib/participantes/__tests__/consultas.test.ts
git commit -m "feat(participantes): adaptador de listas e consultas por proposta (V2 fase B1)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Negócios — listas, detalhe, tarefas e agenda

**Files:**
- Modify: `src/types/processos.ts:178-179`
- Modify: `src/hooks/processos/useProcessos.ts:43-173` (`useProcessos` e `useProcesso`)
- Modify: `src/app/(protected)/processos/[id]/page.tsx:893-907` (rótulo de papel na lista de compradores)
- Modify: `src/hooks/negocios/useNegociosDashboard.ts:84-116`
- Modify: `src/hooks/useAgendaTarefas.ts:18-80`
- Modify: `src/hooks/processos/useProcessoTarefaComentarios.ts:17-46`

**Interfaces:**
- Consumes (Task 1): `EMBED_PARTICIPANTES`, `comListasDeParticipantes`, `nomeTitular`, `ParticipacaoEmbed` (`@/lib/participantes/resumo`); `ParticipanteLista`, `ROTULO_PAPEL`, `PAPEIS_COMPRA` (`@/lib/participantes/tipos`).
- Produces: `Processo.compradores?: ParticipanteLista[]` e `Processo.vendedores?: ParticipanteLista[]` — mesmos campos que os consumidores já leem (`id`, `nome`, `cpf`, `principal`, `pessoa_id`), mais `papel`. Nenhum consumidor lê `telefone` desses embeds (verificado: `grep -rnE "compradores.*telefone" src`).

Consumidores que **não mudam** (só leem `nome/cpf/principal/pessoa_id` e continuam funcionando): `negocios/consorcio/[id]/page.tsx:78-80,199-200`, `processos/[id]/page.tsx:239-244,616-617,636,659`, `ContratoConstrutor.tsx:454`, `PipelineBarProcesso.tsx:88`, `ProcessoCard.tsx:33`, `VisaoCards.tsx:108,525`, `VisaoTabela.tsx:117,126,738,768,877`, `TarefaDetalheModal.tsx:155`.

- [ ] **Step 1: Tipo**

Em `src/types/processos.ts`, trocar as linhas 178-179:

```ts
  compradores?: { id: string; nome: string; cpf: string | null; telefone: string | null; principal: boolean; pessoa_id: string | null }[]
  vendedores?:  { id: string; nome: string; cpf: string | null }[]
```

por:

```ts
  // V2 (fase B1): vêm de participacoes + pessoas (comListasDeParticipantes), não de processo_compradores/vendedores.
  compradores?: ParticipanteLista[]
  vendedores?:  ParticipanteLista[]
```

e acrescentar no topo do arquivo: `import type { ParticipanteLista } from '@/lib/participantes/tipos'`.

- [ ] **Step 2: Rodar tsc e ver o que quebra**

Run: `node ../../../node_modules/typescript/bin/tsc --noEmit -p . 2>&1 | grep -v "^output/"`
Expected: nenhum erro novo (os campos lidos pelos consumidores existem em `ParticipanteLista`). Se aparecer erro de `telefone` em algum consumidor, trocar a leitura por `undefined` não é aceitável — parar e reportar (é leitor de telefone e pertence à B2).

- [ ] **Step 3: `useProcessos` (lista + busca)**

Em `src/hooks/processos/useProcessos.ts`, adicionar os imports:

```ts
import { EMBED_PARTICIPANTES, comListasDeParticipantes, type ParticipacaoEmbed } from '@/lib/participantes/resumo'
import { PAPEIS_COMPRA } from '@/lib/participantes/tipos'
```

No `select` de `useProcessos`, trocar:

```ts
          compradores:processo_compradores(nome, cpf, principal),
          vendedores:processo_vendedores(id, nome, cpf),
```

por:

```ts
          ${EMBED_PARTICIPANTES},
```

Trocar o bloco da busca (de `// Cliente/CPF ficam em processo_compradores` até `const idsCompradores = ...`) por:

```ts
        // Cliente/CPF ficam na Pessoa dos participantes de compra (V2) —
        // não dá pra filtrar direto no .or() principal, então busca os
        // processo_id que batem primeiro e inclui via id.in(...).
        const { data: pessoasMatch, error: erroPessoas } = await supabase
          .from('pessoas')
          .select('id')
          .eq('empresa_id', usuario!.empresa_id)
          .is('deleted_at', null)
          .or(`nome.ilike.%${termo}%,cpf.ilike.%${termo}%`)
          .limit(200)
        if (erroPessoas) throw erroPessoas
        const idsPessoas = (pessoasMatch ?? []).map((p) => p.id as string)
        let idsCompradores: string[] = []
        if (idsPessoas.length > 0) {
          const { data: partsMatch, error: erroParts } = await supabase
            .from('participacoes')
            .select('processo_id')
            .in('pessoa_id', idsPessoas)
            .in('papel', [...PAPEIS_COMPRA])
            .not('processo_id', 'is', null)
          if (erroParts) throw erroParts
          idsCompradores = Array.from(new Set((partsMatch ?? []).map((r) => r.processo_id as string)))
        }
```

(o resto — `orPartes`, `if (idsCompradores.length > 0) ...` — fica igual.)

Trocar o retorno de `useProcessos`:

```ts
      const { data, error } = await query
      if (error) throw error
      return data
```

por:

```ts
      const { data, error } = await query
      if (error) throw error
      return (data ?? []).map((row) => comListasDeParticipantes(row as { participantes?: ParticipacaoEmbed[] | null })) as unknown as Processo[]
```

- [ ] **Step 4: `useProcesso` (detalhe)**

No `select` de `useProcesso`, trocar:

```ts
          compradores:processo_compradores(id, nome, cpf, telefone, principal, pessoa_id),
          vendedores:processo_vendedores(id, nome, cpf),
```

por:

```ts
          ${EMBED_PARTICIPANTES},
```

e o retorno `return data` por:

```ts
      return comListasDeParticipantes(data as { participantes?: ParticipacaoEmbed[] | null }) as unknown as Processo
```

- [ ] **Step 5: Rótulo de papel no detalhe do Negócio**

Em `src/app/(protected)/processos/[id]/page.tsx`, no bloco da lista de compradores (linhas ~899-901), trocar:

```tsx
                  {c.principal && (
                    <span className="text-[10px] bg-fonti-primary text-white px-1.5 py-0.5 rounded-full">Principal</span>
                  )}
```

por:

```tsx
                  {c.principal ? (
                    <span className="text-[10px] bg-fonti-primary text-white px-1.5 py-0.5 rounded-full">Principal</span>
                  ) : c.papel !== 'coparticipante' && (
                    <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">{ROTULO_PAPEL[c.papel]}</span>
                  )}
```

e adicionar o import `import { ROTULO_PAPEL } from '@/lib/participantes/tipos'`.

- [ ] **Step 6: Tarefas próximas (dashboard de Negócios)**

Em `src/hooks/negocios/useNegociosDashboard.ts`, no select de `processo_tarefas`, trocar `compradores:processo_compradores(nome, principal)` por `${EMBED_PARTICIPANTES}` e o cálculo:

```ts
        const nomeComprador =
          p?.compradores?.find((c: any) => c.principal)?.nome ??
          p?.compradores?.[0]?.nome ??
          p?.nome_imovel ?? ''
```

por:

```ts
        const nomeComprador = nomeTitular(p?.participantes) ?? p?.nome_imovel ?? ''
```

Import: `import { EMBED_PARTICIPANTES, nomeTitular } from '@/lib/participantes/resumo'`. Confirmar que o `.select(` desse trecho usa template literal (crase); se usar aspas simples, trocar por crase.

- [ ] **Step 7: Agenda**

Em `src/hooks/useAgendaTarefas.ts`, mesma troca do Step 6 (select `compradores:processo_compradores(nome, principal)` → `${EMBED_PARTICIPANTES}`; `nomeComprador` → `nomeTitular(p?.participantes) ?? p?.nome_imovel ?? ''`), mesmo import.

- [ ] **Step 8: Tarefa por id (modal de tarefa)**

Em `src/hooks/processos/useProcessoTarefaComentarios.ts` (`useProcessoTarefaById`), trocar `compradores:processo_compradores(nome, principal)` por `${EMBED_PARTICIPANTES}` e o retorno:

```ts
      if (error) throw error
      return data as ProcessoTarefa & {
```

por:

```ts
      if (error) throw error
      const processo = (data as { processo?: { participantes?: ParticipacaoEmbed[] | null } | null }).processo
      return { ...data, processo: processo ? comListasDeParticipantes(processo) : null } as ProcessoTarefa & {
```

(o tipo declarado logo abaixo — `compradores: { nome: string; principal: boolean }[]` — continua válido, `ParticipanteLista` tem esses campos.) Import: `import { EMBED_PARTICIPANTES, comListasDeParticipantes, type ParticipacaoEmbed } from '@/lib/participantes/resumo'`. `TarefaDetalheModal.tsx:155` não muda.

- [ ] **Step 9: Verificar**

Run: `node ../../../node_modules/typescript/bin/tsc --noEmit -p . 2>&1 | grep -v "^output/"` → sem erros.
Run: `grep -rn "processo_compradores\|processo_vendedores" src/hooks/processos/useProcessos.ts src/hooks/negocios/useNegociosDashboard.ts src/hooks/useAgendaTarefas.ts src/hooks/processos/useProcessoTarefaComentarios.ts` → só o comentário explicativo, nenhuma query.
Run: `node ../../../node_modules/vitest/vitest.mjs run --dir src --exclude ".claude/**" --exclude "output/**"` → só as 5 falhas pré-existentes.

- [ ] **Step 10: Commit**

```bash
git add src/types/processos.ts src/hooks/processos/useProcessos.ts "src/app/(protected)/processos/[id]/page.tsx" src/hooks/negocios/useNegociosDashboard.ts src/hooks/useAgendaTarefas.ts src/hooks/processos/useProcessoTarefaComentarios.ts
git commit -m "feat(participantes): negócios, tarefas e agenda leem participantes (V2 fase B1)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Documentos, formulários e bot

**Files:**
- Modify: `src/components/documentos/AbaDocumentos.tsx:188-201` (papéis) e `:382-409` (dono do upload no Negócio)
- Modify: `src/lib/documentos/contextoLeadServidor.ts:58-61` (`carregarVendedoresDoLead`)
- Modify: `src/lib/documentos/ocr.ts:345-350` (vendedores do lead na sugestão de pasta)
- Modify: `src/lib/documentos/__tests__/processarOcrDocumento.test.ts:94-104,141` (mock)
- Modify: `src/app/api/processos/[id]/formularios/route.ts:121-142` (Pessoa dona do formulário)
- Modify: `src/lib/bot/fonti-comandos.ts:600-641` (`buscarProcessosAtivos`, `buscarCompradorPrincipalProcesso`)

**Interfaces:**
- Consumes (Task 1): `pessoasDaProposta`, `titularDaProposta`, `processosDaPessoa` (`@/lib/participantes/consultas`); `PAPEIS_COMPRA`, `PAPEIS_VENDA` (`@/lib/participantes/tipos`).
- Produces: nada novo; `buscarCompradorPrincipalProcesso` continua devolvendo `{ pessoa_id, nome } | null` (usado em `fonti-comandos.ts:681` e `:1693`).

- [ ] **Step 1: Ajustar o mock do teste de OCR para o modelo novo (vai falhar)**

Em `src/lib/documentos/__tests__/processarOcrDocumento.test.ts`, trocar a função `tabelaLeadVendedores` (linhas 94-104) por:

```ts
  function tabelaParticipacoes() {
    const filtros: Record<string, unknown> = {}
    let papeis: unknown[] = []
    const q: Record<string, unknown> = {}
    q.select = () => q
    q.eq = (k: string, v: unknown) => { filtros[k] = v; return q }
    q.in = (k: string, vs: unknown[]) => { if (k === 'papel') papeis = vs; return q }
    q.then = (resolve: (v: { data: unknown; error: null }) => void) => {
      const ids = papeis.includes('vendedor') ? (estado.vendedoresPorLead[filtros.lead_id as string] ?? []) : []
      resolve({ data: ids.map(id => ({ pessoa_id: id })), error: null })
    }
    return q
  }
```

e a linha 141 `case 'lead_vendedores': return tabelaLeadVendedores()` por `case 'participacoes': return tabelaParticipacoes()`.

Run: `node ../../../node_modules/vitest/vitest.mjs run --dir src --exclude ".claude/**" --exclude "output/**" src/lib/documentos/__tests__/processarOcrDocumento.test.ts`
Expected: FAIL — `tabela não mockada em processarOcrDocumento.test.ts: lead_vendedores`.

- [ ] **Step 2: OCR lê vendedores do lead pelas participações**

Em `src/lib/documentos/ocr.ts`, trocar (linhas ~346-350):

```ts
      const { data: vendedores } = await supabase
        .from('lead_vendedores')
        .select('pessoa_id')
        .eq('lead_id', vinculo.entidade_id)
      const pessoasVendedorasIds = (vendedores ?? []).map(v => v.pessoa_id as string)
```

por:

```ts
      // Vendedor e cônjuge do vendedor (V2: participações do lead).
      const pessoasVendedorasIds = await pessoasDaProposta(supabase, { tipo: 'lead', id: vinculo.entidade_id }, PAPEIS_VENDA)
```

Imports: `import { pessoasDaProposta } from '@/lib/participantes/consultas'` e `import { PAPEIS_VENDA } from '@/lib/participantes/tipos'`. (Se a variável local do cliente nesse trecho não se chamar `supabase`, usar o nome local.)

Run o teste do Step 1 → PASS.

- [ ] **Step 3: Organizar documentos do lead**

Em `src/lib/documentos/contextoLeadServidor.ts`, trocar `carregarVendedoresDoLead`:

```ts
export async function carregarVendedoresDoLead(leadId: string): Promise<string[]> {
  const { data } = await supabase.from('lead_vendedores').select('pessoa_id').eq('lead_id', leadId)
  return (data ?? []).map(v => v.pessoa_id as string)
}
```

por:

```ts
/** Vendedor e cônjuge do vendedor do lead (V2: participações). Lança se a consulta falhar. */
export async function carregarVendedoresDoLead(leadId: string): Promise<string[]> {
  return pessoasDaProposta(supabase, { tipo: 'lead', id: leadId }, PAPEIS_VENDA)
}
```

com os mesmos dois imports do Step 2. O único chamador (`src/app/api/leads/[id]/organizar-documentos/classificar/route.ts:30`) já está dentro de `Promise.all` numa rota com try/catch — conferir que uma exceção aqui vira resposta 500 com mensagem (não página em branco); se a rota não tiver try/catch em volta, envolver só esse `Promise.all` e responder `{ error }` com status 500.

- [ ] **Step 4: Aba Documentos do Negócio**

Em `src/components/documentos/AbaDocumentos.tsx`, trocar o `queryFn` de `papeisProcesso` (linhas ~191-200):

```ts
    queryFn: async () => {
      const [{ data: compradores }, { data: vendedores }] = await Promise.all([
        supabase.from('processo_compradores').select('pessoa_id').eq('processo_id', processoId!).eq('empresa_id', usuario!.empresa_id),
        supabase.from('processo_vendedores').select('pessoa_id').eq('processo_id', processoId!).eq('empresa_id', usuario!.empresa_id),
      ])
      return {
        compradoras: (compradores ?? []).map(c => c.pessoa_id).filter((id): id is string => !!id),
        vendedoras:  (vendedores ?? []).map(v => v.pessoa_id).filter((id): id is string => !!id),
      }
    },
```

por:

```ts
    queryFn: async () => {
      // V2: papéis vêm das participações (RLS de participacoes limita à empresa/carteira).
      const ref = { tipo: 'processo' as const, id: processoId! }
      const [compradoras, vendedoras] = await Promise.all([
        pessoasDaProposta(supabase, ref, PAPEIS_COMPRA),
        pessoasDaProposta(supabase, ref, PAPEIS_VENDA),
      ])
      return { compradoras, vendedoras }
    },
```

e a função `resolverPessoaIdUpload` inteira (linhas ~382-409) por:

```ts
  // Resolve a Pessoa dona do documento no momento do upload.
  // Lead: prop estática. Pessoa: é a própria entidade. Processo: Pessoa do titular (V2).
  // Sem titular ativo (ex.: titular excluído) devolve null — o upload já trata isso como erro.
  async function resolverPessoaIdUpload(): Promise<string | null> {
    if (contexto === 'pessoa') return entidadeId ?? null
    if (contexto === 'lead') return pessoaId ?? null
    if (!processoId || !usuario) return null
    const titular = await titularDaProposta(supabase, { tipo: 'processo', id: processoId })
    return titular?.pessoa_id ?? null
  }
```

Imports: `import { pessoasDaProposta, titularDaProposta } from '@/lib/participantes/consultas'` e `import { PAPEIS_COMPRA, PAPEIS_VENDA } from '@/lib/participantes/tipos'`. Conferir no chamador de `resolverPessoaIdUpload` que `null` gera toast de erro (não upload silencioso sem dono); se não gerar, parar e reportar.

- [ ] **Step 5: Formulários do Negócio**

Em `src/app/api/processos/[id]/formularios/route.ts`, trocar o trecho que começa em `// Modelo definitivo: formulário gerado entra no acervo documental da Pessoa,` até antes de `if (!pessoaIdProcesso) {` por:

```ts
    // Modelo definitivo: formulário gerado entra no acervo documental da Pessoa,
    // que exige pessoa_id — Pessoa do titular da proposta (V2: participações).
    let pessoaIdProcesso: string | null = null
    try {
      pessoaIdProcesso = (await titularDaProposta(supabaseAdmin, { tipo: 'processo', id: params.id }))?.pessoa_id ?? null
    } catch (e) {
      console.error('[processos/formularios] titular:', e)
      return NextResponse.json({ error: 'Erro ao identificar o comprador principal deste processo.' }, { status: 500 })
    }
```

(o `if (!pessoaIdProcesso) { return ... 400 }` seguinte fica igual.) Import: `import { titularDaProposta } from '@/lib/participantes/consultas'`. Não mexer no restante da rota (montagem dos dados é a Fase A, overlay fica para a B2).

- [ ] **Step 6: Bot (`*salva processo`, `*fonti processo`)**

Em `src/lib/bot/fonti-comandos.ts`, trocar `buscarProcessosAtivos` (o primeiro SELECT, em `processo_compradores`) por participações de compra da Pessoa:

```ts
async function buscarProcessosAtivos(
  supabase: SupabaseClient,
  empresa_id: string,
  pessoa_id: string,
) {
  // V2: qualquer papel de compra (titular, coparticipante, cônjuge anuente), não só a linha antiga do comprador.
  let processoIds: string[]
  try {
    processoIds = await processosDaPessoa(supabase, empresa_id, pessoa_id, PAPEIS_COMPRA, { timeoutMs: 10000 })
  } catch (e) {
    console.error('[buscarProcessosAtivos] participacoes:', e)
    return []
  }
  if (!processoIds.length) return []

  const { data: processos } = await supabase
```

(daqui para baixo — a query em `processos` com `.in('id', processoIds)` e o `return` — fica igual.)

E `buscarCompradorPrincipalProcesso` por:

```ts
async function buscarCompradorPrincipalProcesso(
  supabase: SupabaseClient,
  empresa_id: string,
  processo_id: string,
) {
  // V2: titular da proposta. Erro vira "sem comprador" (o bot ainda responde ao operador — mesmo
  // comportamento de antes, quando a query sem checagem de erro devolvia null).
  try {
    const t = await titularDaProposta(supabase, { tipo: 'processo', id: processo_id }, { timeoutMs: 10000 })
    return t ? { pessoa_id: t.pessoa_id, nome: t.nome } : null
  } catch (e) {
    console.error('[buscarCompradorPrincipalProcesso] titular:', e)
    return null
  }
}
```

`empresa_id` continua no parâmetro (chamadores não mudam); a participação do processo já é da empresa do processo, resolvido antes por número/UUID escopado na empresa. Imports: `import { processosDaPessoa, titularDaProposta } from '@/lib/participantes/consultas'` e `PAPEIS_COMPRA` de `@/lib/participantes/tipos` (se `PAPEIS_COMPRA` já estiver importado pela Fase A, não duplicar).

- [ ] **Step 7: Verificar**

Run: `grep -rnE "from\('(processo_compradores|processo_vendedores|lead_vendedores)'\)" src/components/documentos/AbaDocumentos.tsx src/lib/documentos/contextoLeadServidor.ts src/lib/documentos/ocr.ts "src/app/api/processos/[id]/formularios/route.ts" src/lib/bot/fonti-comandos.ts` → nenhum resultado.
Run: `node ../../../node_modules/typescript/bin/tsc --noEmit -p . 2>&1 | grep -v "^output/"` → sem erros.
Run: `node ../../../node_modules/vitest/vitest.mjs run --dir src --exclude ".claude/**" --exclude "output/**"` → só as 5 falhas pré-existentes (inclui os testes do bot em `src/lib/bot/__tests__` e de documentos).

- [ ] **Step 8: Commit**

```bash
git add src/components/documentos/AbaDocumentos.tsx src/lib/documentos/contextoLeadServidor.ts src/lib/documentos/ocr.ts src/lib/documentos/__tests__/processarOcrDocumento.test.ts "src/app/api/processos/[id]/formularios/route.ts" src/lib/bot/fonti-comandos.ts
git commit -m "feat(participantes): documentos, formulários e bot leem participantes (V2 fase B1)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Captação — lista de leads, resumo do lead e busca global

**Files:**
- Modify: `src/hooks/leads/useLeads.ts:106-137` (`useLeadsTodos`)
- Modify: `src/components/leads/LeadDetalhe/AbaResumo.tsx:182-211` (bloco do cônjuge → participantes)
- Modify: `src/hooks/busca/useBuscaGlobal.ts:117-125,207-235` (busca "via cônjuge" → "via participante")

**Interfaces:**
- Consumes (Task 1): `EMBED_PARTICIPANTES`, `comoLeadVendedores`, `ParticipacaoEmbed`; `ROTULO_PAPEL`, `PapelParticipacao`; Fase A: `useParticipantes(ref)` (`@/hooks/participantes/useParticipantes`, devolve `ParticipanteResumo[]` com `id, papel, compoe_renda, ordem, pessoa{id,nome,renda_formal,renda_informal}`, já sem Pessoa excluída).
- Produces: `Lead.vendedores` na lista de leads no formato `LeadVendedor` (sem mudança de tipo). `useLead` (detalhe) **não muda** nesta etapa — é lido por AbaCredito/NovoProcessoModal/AbaPessoa, que são escritores (B2).

- [ ] **Step 1: Lista de leads**

Em `src/hooks/leads/useLeads.ts` (`useLeadsTodos`), trocar no select:

```ts
          vendedores:lead_vendedores(id, pessoa_id, pessoa:pessoas(id, nome, cpf)),
```

por:

```ts
          ${EMBED_PARTICIPANTES},
```

e o retorno `return data as Lead[]` por:

```ts
      return (data ?? []).map(({ participantes, ...l }: { participantes?: ParticipacaoEmbed[] | null } & Record<string, unknown>) => ({
        ...l,
        vendedores: comoLeadVendedores(participantes),
      })) as unknown as Lead[]
```

Import: `import { EMBED_PARTICIPANTES, comoLeadVendedores, type ParticipacaoEmbed } from '@/lib/participantes/resumo'`. `LeadListView.tsx:121,969` não muda (fallback `lead.vendedor_nome` preservado).

- [ ] **Step 2: Resumo do lead mostra os participantes**

Em `src/components/leads/LeadDetalhe/AbaResumo.tsx`:

1. Imports: `import { useParticipantes } from '@/hooks/participantes/useParticipantes'` e `import { ROTULO_PAPEL } from '@/lib/participantes/tipos'`.
2. No corpo do componente, junto dos outros hooks (antes de qualquer `return` condicional): `const { data: participantes = [] } = useParticipantes({ tipo: 'lead', id: lead.id })` e `const outrosParticipantes = participantes.filter(pt => pt.papel !== 'titular')`.
3. Remover o bloco do cônjuge dentro de "Perfil do Cliente":

```tsx
          {lead.conjuge_nome && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-400 mb-2">Cônjuge</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
                <Campo label="Nome" valor={lead.conjuge_nome} />
                {lead.conjuge_cpf && <Campo label="CPF" valor={lead.conjuge_cpf} />}
              </div>
            </div>
          )}
```

4. Logo depois do card "Perfil do Cliente" (antes de `{/* ── Últimas Notas ── */}`), inserir:

```tsx
      {/* ── Participantes da proposta (V2) ── */}
      {outrosParticipantes.length > 0 && (
        <div className="border border-gray-300 rounded-xl p-4 bg-white shadow">
          <div className="flex items-center gap-2 mb-3">
            <Users className="h-4 w-4 text-gray-400" />
            <p className="text-[11px] font-bold text-fonti-primary uppercase tracking-widest">Participantes</p>
          </div>
          <div className="space-y-1.5">
            {outrosParticipantes.map(pt => (
              <div key={pt.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-fonti-primary font-medium">{pt.pessoa.nome}</span>
                <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">{ROTULO_PAPEL[pt.papel]}</span>
                {pt.compoe_renda && <span className="text-[10px] text-emerald-700">compõe renda</span>}
              </div>
            ))}
          </div>
        </div>
      )}
```

(o card aparece mesmo quando o titular não tem profissão/estado civil/nascimento — antes o cônjuge sumia nesse caso.)

- [ ] **Step 3: Busca global "via participante"**

Em `src/hooks/busca/useBuscaGlobal.ts`, trocar a consulta `conjugeData` (linhas ~117-124):

```ts
        // Busca via cônjuge — requer migration 094 aplicada no Supabase
        const { data: conjugeData } = await supabase
          .from('leads')
          .select('id, nome, telefone, cpf, fase:fases!fase_id(nome, cor), conjuge_pessoa:pessoas!conjuge_pessoa_id(id, nome, cpf)')
          .eq('empresa_id', empresa)
          .is('deleted_at', null)
          .not('conjuge_pessoa_id', 'is', null)
          .limit(6)
          .then(r => r.error ? { data: null } : r)
```

por:

```ts
        // Leads onde a pessoa buscada é participante não-titular (coparticipante/cônjuge) — V2.
        // O termo filtra no banco (antes: 6 leads quaisquer com cônjuge, filtrados depois no cliente).
        const { data: participanteData } = await supabase
          .from('participacoes')
          .select('papel, pessoa:pessoas!pessoa_id!inner(id, nome, cpf, deleted_at), lead:leads!lead_id!inner(id, nome, deleted_at, fase:fases!fase_id(nome, cor))')
          .eq('empresa_id', empresa)
          .in('papel', ['coparticipante', 'conjuge_anuente'])
          .is('pessoa.deleted_at', null)
          .is('lead.deleted_at', null)
          .or(`nome.ilike.${q},cpf.ilike.${q}`, { referencedTable: 'pessoa' })
          .limit(6)
          .then(r => r.error ? { data: null } : r)
```

e o bloco `const leadsViaConjuge: ResultadoBusca[] = (conjugeData ?? [])...` (da linha `// Leads encontrados via cônjuge` até o `.filter((r: ResultadoBusca) => !leads.find(l => l.id === r.id))` que o fecha) por:

```ts
        // Leads encontrados via participante (coparticipante/cônjuge)
        const leadsViaConjuge: ResultadoBusca[] = (participanteData ?? [])
          .map((row: any) => ({
            papel: row.papel as PapelParticipacao,
            pessoa: Array.isArray(row.pessoa) ? row.pessoa[0] : row.pessoa,
            lead: Array.isArray(row.lead) ? row.lead[0] : row.lead,
          }))
          .filter(({ pessoa, lead }) => {
            if (!pessoa || !lead) return false
            const faseNome = Array.isArray(lead.fase) ? lead.fase[0]?.nome : lead.fase?.nome
            return !faseExcluida(faseNome)
          })
          .map(({ papel, pessoa, lead }) => {
            const faseNome = Array.isArray(lead.fase) ? lead.fase[0]?.nome : lead.fase?.nome
            const faseCor  = Array.isArray(lead.fase) ? lead.fase[0]?.cor  : lead.fase?.cor
            return {
              tipo:      'lead' as const,
              id:        lead.id,
              titulo:    lead.nome,
              subtitulo: `via ${ROTULO_PAPEL[papel].toLowerCase()}: ${pessoa.nome ?? ''}`,
              fase:      faseNome,
              faseCor,
            }
          })
          .filter((r: ResultadoBusca) => !leads.find(l => l.id === r.id))
```

Imports: `import { ROTULO_PAPEL, type PapelParticipacao } from '@/lib/participantes/tipos'`. Manter o nome `leadsViaConjuge` (usado mais abaixo no arquivo). Conferir com `grep -n "termoLower" src/hooks/busca/useBuscaGlobal.ts` — se `termoLower` ficou sem uso, remover a declaração.

- [ ] **Step 4: Verificar**

Run: `node ../../../node_modules/typescript/bin/tsc --noEmit -p . 2>&1 | grep -v "^output/"` → sem erros.
Run: `node ../../../node_modules/vitest/vitest.mjs run --dir src --exclude ".claude/**" --exclude "output/**"` → só as 5 falhas pré-existentes.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/leads/useLeads.ts src/components/leads/LeadDetalhe/AbaResumo.tsx src/hooks/busca/useBuscaGlobal.ts
git commit -m "feat(participantes): captação e busca global leem participantes (V2 fase B1)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Funções SQL de relatório/financeiro (migration 328) + diagnóstico de equivalência

**Files:**
- Create: `supabase/2026-10-03_equivalencia_leitores_participantes_v2.sql` (só leitura; o usuário roda ANTES da 328)
- Create: `supabase/migrations/20261003_328_participantes_v2_leitores_sql.sql`

**Interfaces:**
- Consumes: `participacoes` (papel `titular`), `pessoas` (Fase A).
- Produces: mesmas 9 funções, mesmas assinaturas e retornos; só a fonte do nome/CPF do cliente muda. Nenhum `GRANT`/`REVOKE` muda (`CREATE OR REPLACE` preserva privilégios).

As 9 funções e onde está a definição **mais recente** de cada uma (é essa que deve ser copiada — versões anteriores em outras migrations estão obsoletas):

| Função | Arquivo e linha da definição vigente | Variante do LATERAL |
|---|---|---|
| `analise_comissoes_contratos_mes(uuid, integer, integer)` | `20260911_296_fix_prioridade_pessoa_id_vs_comprador.sql:645` | nome, cpf |
| `analise_comissoes_mes(uuid, integer, integer)` | `20260914_307_multiplas_regras_comissao_por_categoria.sql:813` | nome, cpf |
| `busca_pessoas_resumo(text)` | `20260725_188_fix_busca_pessoas_resumo_compradores.sql:11` | CTE (ver abaixo) |
| `contas_a_receber_mes_preview(uuid, integer, integer)` | `20260826_272_fix_ambiguidade_id_preview_ao_vivo.sql:117` | nome (2×) |
| `contas_a_receber_mes_vivo(uuid, integer, integer)` | `20260911_301_comissoes_padrao_faixas_de_valor.sql:877` | nome (2×) |
| `emissoes_mes_preview(uuid, integer, integer)` | `20260911_296_fix_prioridade_pessoa_id_vs_comprador.sql:269` | nome (2×) |
| `garantir_conta_receber_processo(uuid)` | `20260911_301_comissoes_padrao_faixas_de_valor.sql:992` | nome |
| `puxar_contratos(...)` | `20260914_306_contrato_conta_por_data_pagamento.sql:338` | nome |
| `puxar_processos_emitidos(...)` | `20260911_301_comissoes_padrao_faixas_de_valor.sql:522` | nome |

Antes de escrever, confirmar que nenhuma migration **posterior** a esses arquivos redefine a função: `grep -ln "FUNCTION <nome>" supabase/migrations/*.sql | sort | tail -1` deve devolver o arquivo da tabela.

- [ ] **Step 1: Diagnóstico de equivalência (só leitura)**

`supabase/2026-10-03_equivalencia_leitores_participantes_v2.sql`:

```sql
-- ============================================================
-- Participantes V2 — Fase B1: equivalência dos leitores SQL (SÓ LEITURA).
-- Rodar ANTES da migration 328. Lista todo negócio cujo "cliente" muda quando
-- os relatórios passam de processo_compradores (principal) para a Pessoa do
-- titular em participacoes. Esperado: só os 3 negócios sem titular conhecidos
-- (1 Pessoa excluída, 2 pessoas de operador) + negócios cujo nome copiado em
-- processo_compradores difere do nome atual da Pessoa (a Pessoa passa a valer).
-- ============================================================

-- Bloco 1: nome do cliente, antigo × novo
WITH antigo AS (
  SELECT p.id,
    (SELECT pcomp.nome FROM processo_compradores pcomp
      WHERE pcomp.processo_id = p.id
      ORDER BY pcomp.principal DESC NULLS LAST, pcomp.created_at ASC LIMIT 1) AS nome
  FROM processos p WHERE p.deleted_at IS NULL
), novo AS (
  SELECT p.id,
    (SELECT tp.nome FROM participacoes tpa JOIN pessoas tp ON tp.id = tpa.pessoa_id
      WHERE tpa.processo_id = p.id AND tpa.papel = 'titular' LIMIT 1) AS nome
  FROM processos p WHERE p.deleted_at IS NULL
)
SELECT pr.numero_processo, pr.status_emissao, a.nome AS cliente_antigo, n.nome AS cliente_novo,
       CASE WHEN n.nome IS NULL THEN 'sem titular (cai em processos.pessoa_id)' ELSE 'nome da Pessoa difere do copiado' END AS motivo
FROM antigo a JOIN novo n USING (id) JOIN processos pr ON pr.id = a.id
WHERE a.nome IS DISTINCT FROM n.nome
ORDER BY pr.numero_processo;

-- Bloco 2: pessoas ligadas a processo, antigo (processo_compradores) × novo (participações de compra)
WITH antigo AS (
  SELECT DISTINCT processo_id, pessoa_id FROM processo_compradores WHERE pessoa_id IS NOT NULL
), novo AS (
  SELECT DISTINCT processo_id, pessoa_id FROM participacoes
  WHERE processo_id IS NOT NULL AND papel IN ('titular', 'coparticipante', 'conjuge_anuente')
)
SELECT 'só no antigo' AS lado, pr.numero_processo, pe.nome
FROM antigo a JOIN processos pr ON pr.id = a.processo_id JOIN pessoas pe ON pe.id = a.pessoa_id
WHERE NOT EXISTS (SELECT 1 FROM novo n WHERE n.processo_id = a.processo_id AND n.pessoa_id = a.pessoa_id)
UNION ALL
SELECT 'só no novo', pr.numero_processo, pe.nome
FROM novo n JOIN processos pr ON pr.id = n.processo_id JOIN pessoas pe ON pe.id = n.pessoa_id
WHERE NOT EXISTS (SELECT 1 FROM antigo a WHERE a.processo_id = n.processo_id AND a.pessoa_id = n.pessoa_id)
ORDER BY 1, 2;
-- Bloco 2 esperado: "só no antigo" = pessoas excluídas/de operador; "só no novo" = cônjuges
-- anuentes (vêm do Relacionamento, nunca estiveram em processo_compradores) — a busca de
-- pessoas passa a mostrar o negócio também na Pessoa do cônjuge.
```

- [ ] **Step 2: Migration 328**

Criar `supabase/migrations/20261003_328_participantes_v2_leitores_sql.sql` com este cabeçalho e, em seguida, as 9 funções:

```sql
-- ============================================================
-- Migration 328: Participantes V2 — Fase B1: leitores SQL (relatórios, financeiro, busca)
-- Nome/CPF do cliente passam a vir da Pessoa do TITULAR em participacoes, não de
-- processo_compradores. Enquanto a sincronização da Fase A existir, o resultado é o
-- mesmo (ver supabase/2026-10-03_equivalencia_leitores_participantes_v2.sql, rodar ANTES).
-- Cada função abaixo é cópia literal da definição vigente (arquivo/linha no comentário),
-- alterando SÓ o bloco LATERAL "pc" (ou a CTE processo_pessoa em busca_pessoas_resumo).
-- Relatórios de negócio já emitido NÃO filtram pessoas.deleted_at: Pessoa excluída
-- depois continua aparecendo pelo nome no histórico (mesmo comportamento de antes,
-- quando o nome vinha copiado em processo_compradores).
-- contas_a_receber_mes_preview: corrige de carona COALESCE(pe.nome, pc.nome) →
-- COALESCE(pc.nome, pe.nome), mesma prioridade que a 296 aplicou nas outras funções
-- (processos.pessoa_id é legado e pode apontar para a pessoa errada).
-- Rodar fora do horário comercial (CREATE OR REPLACE de função usada pelo financeiro).
-- ============================================================
BEGIN;
```

Para cada função da tabela: copiar o bloco `CREATE OR REPLACE FUNCTION ... $$;` inteiro do arquivo/linha indicado (até o fim do corpo, incluindo `LANGUAGE`/`SECURITY DEFINER`/`SET search_path` exatamente como estão), precedido de um comentário `-- de <arquivo>:<linha>`, e substituir **cada** ocorrência do LATERAL antigo:

Variante "nome" (em qualquer uma das grafias encontradas — com/sem alias `pcomp`, com/sem `created_at ASC`), por exemplo:

```sql
    LEFT JOIN LATERAL (
      SELECT nome FROM processo_compradores WHERE processo_id = p.id
      ORDER BY principal DESC NULLS LAST, created_at ASC LIMIT 1
    ) pc ON true
```

por:

```sql
    LEFT JOIN LATERAL (
      SELECT tp.nome FROM participacoes tpa
      JOIN pessoas tp ON tp.id = tpa.pessoa_id
      WHERE tpa.processo_id = p.id AND tpa.papel = 'titular'
      LIMIT 1
    ) pc ON true
```

Variante "nome, cpf":

```sql
    LEFT JOIN LATERAL (
      SELECT pcomp.nome, pcomp.cpf FROM processo_compradores pcomp
      WHERE pcomp.processo_id = p.id
      ORDER BY pcomp.principal DESC NULLS LAST, pcomp.created_at ASC LIMIT 1
    ) pc ON true
```

por:

```sql
    LEFT JOIN LATERAL (
      SELECT tp.nome, tp.cpf FROM participacoes tpa
      JOIN pessoas tp ON tp.id = tpa.pessoa_id
      WHERE tpa.processo_id = p.id AND tpa.papel = 'titular'
      LIMIT 1
    ) pc ON true
```

Em `contas_a_receber_mes_preview`, além do LATERAL, trocar as 4 ocorrências de `COALESCE(pe.nome, pc.nome, '')` por `COALESCE(pc.nome, pe.nome, '')`.

Em `busca_pessoas_resumo`, trocar só o segundo ramo da CTE `processo_pessoa`:

```sql
    UNION
    SELECT pc.processo_id, pc.pessoa_id
    FROM processo_compradores pc
    WHERE pc.pessoa_id IS NOT NULL
```

por:

```sql
    UNION
    -- V2: qualquer participante de compra (titular, coparticipante, cônjuge anuente).
    SELECT pa.processo_id, pa.pessoa_id
    FROM participacoes pa
    WHERE pa.processo_id IS NOT NULL
      AND pa.papel IN ('titular', 'coparticipante', 'conjuge_anuente')
```

e atualizar o comentário acima dela (troca `processo_compradores.pessoa_id` por `participacoes`).

Fechar o arquivo com `COMMIT;`.

- [ ] **Step 3: Revisão estática**

Run: `grep -c "processo_compradores" supabase/migrations/20261003_328_participantes_v2_leitores_sql.sql` → apenas as ocorrências em comentários (conferir linha a linha com `grep -n`; nenhuma em `FROM`/`JOIN`).
Run: `grep -c "CREATE OR REPLACE FUNCTION" supabase/migrations/20261003_328_participantes_v2_leitores_sql.sql` → `9`.
Para cada função, comparar com a original: `diff <(sed -n '<ini>,<fim>p' <arquivo original>) <(trecho correspondente da 328)` — a única diferença permitida é o bloco LATERAL/CTE (e o COALESCE da `contas_a_receber_mes_preview`). Anotar o resultado no relatório da task.

- [ ] **Step 4: Commit**

```bash
git add supabase/2026-10-03_equivalencia_leitores_participantes_v2.sql supabase/migrations/20261003_328_participantes_v2_leitores_sql.sql
git commit -m "feat(participantes): relatórios e busca de pessoas leem o titular das participações (V2 fase B1, migration 328)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5 (usuário, no Supabase — independe do merge do código): rodar a 328**

1. Rodar `supabase/2026-10-03_equivalencia_leitores_participantes_v2.sql` e revisar os dois blocos junto com o Claude.
2. Fora do horário comercial: rodar a migration 328.
3. Conferência: `SELECT cliente_nome FROM emissoes_mes_preview('<empresa_id>', 9, 2026);` — os nomes do mês devem bater com o que a tela de Relatórios mostrava antes.

(A 328 e o código da B1 são independentes: o código só lê `participacoes`, que já existe; a 328 só troca a fonte dentro das funções. Podem ir ao ar em qualquer ordem.)

---

### Task 6: Regra no CLAUDE.md + entrega

**Files:**
- Modify: `CLAUDE.md` (seção nova, depois da seção da Fase A dos participantes)

- [ ] **Step 1: Documentar a regra**

Acrescentar ao `CLAUDE.md` do projeto (na worktree), logo depois da seção sobre Participantes V2 da Fase A (procurar com `grep -n "Participantes V2" CLAUDE.md`):

```markdown
### Participantes V2 — Fase B1: leitor novo lê participações, nunca as tabelas antigas (2026-10)

Listas e identidade de quem participa de um lead/negócio (nome, CPF, papel, titular) vêm de
`participacoes` + `pessoas`: embed `EMBED_PARTICIPANTES` + `comListasDeParticipantes`/
`compradoresDaProposta`/`nomeTitular` (`src/lib/participantes/resumo.ts`) no cliente, e
`titularDaProposta`/`pessoasDaProposta`/`processosDaPessoa` (`src/lib/participantes/consultas.ts`)
no servidor/bot. Nenhum leitor novo pode ler `processo_compradores`, `processo_vendedores`,
`lead_vendedores`, `lead_coparticipantes` nem `leads/pessoas.conjuge_*` — essas tabelas deixam
de ser escritas na Fase B2 e viram `_legado` na B3; um leitor novo nelas vai mostrar dado velho
sem erro nenhum. Em SQL: `JOIN participacoes ... papel = 'titular'` (ver migration 328).
**Exceção temporária até a B2:** e-mail/telefone de comprador (Clicksign, e-mail de confirmação
de valores, interessados/comunicação, overlay de `formularios/dados.ts`) ainda leem as linhas
antigas, porque a inclusão de comprador pela aba do Negócio grava e-mail/telefone só em
`processo_compradores` — ler da Pessoa antes da B2 perde esses valores.
```

- [ ] **Step 2: Verificação final**

Run: `node ../../../node_modules/vitest/vitest.mjs run --dir src --exclude ".claude/**" --exclude "output/**"` → só as 5 falhas pré-existentes.
Run: `node ../../../node_modules/typescript/bin/tsc --noEmit -p . 2>&1 | grep -v "^output/"` → sem erros.
Run: `grep -rlnE "from\('(processo_compradores|processo_vendedores|lead_vendedores|lead_coparticipantes)'\)|:(processo_compradores|processo_vendedores|lead_vendedores|lead_coparticipantes)\(" src --include=*.ts --include=*.tsx | grep -v __tests__ | sort` → só arquivos da lista "fica para a B2" (escritores e leitores de e-mail/telefone): `(protected)/pessoas/[id]/page.tsx`, `clicksign/enviar`, `pessoas/[id]/merge`, `processos/[id]/atualizar-cliente`, `processos/[id]/contratos/documentos/resolver-pessoa`, `processos/[id]/interessados`, `processos/[id]/emails/confirmacao-valores/preview`, `AbaPessoa.tsx`, `AbaCredito.tsx`, `NovoProcessoModal.tsx`, `CompletarDadosPessoaDrawer.tsx`, `NovoProcessoRapidoModal.tsx`, `AbaVendedores.tsx`, `useEditarLead.ts`, `useLeads.ts` (só `useLead`, detalhe), `useProcessoCompradores.ts`, `useProcessoVendedores.ts`, `formularios/dados.ts` (overlay). Qualquer outro arquivo na lista = leitor esquecido → corrigir antes de seguir.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude-md): regra de leitores da Fase B1 dos participantes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Copiar SQL para a raiz (regra do CLAUDE.md sobre migrations de worktree)**

Copiar **só** estes dois arquivos para o checkout principal (sem commit lá):
- `supabase/migrations/20261003_328_participantes_v2_leitores_sql.sql` → `C:/Users/Marci/Downloads/openclau/squads/credifon-crm/supabase/migrations/`
- `supabase/2026-10-03_equivalencia_leitores_participantes_v2.sql` → `C:/Users/Marci/Downloads/openclau/squads/credifon-crm/supabase/`

- [ ] **Step 5: Entrega**

Seguir superpowers:finishing-a-development-branch. PR para `main` com o resultado do diagnóstico de equivalência (se o usuário já tiver rodado) e a lista do Step 2. Merge só com o preview da Vercel verde e com o "pode mergear" do usuário.
