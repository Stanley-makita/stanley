# Documentos da Pessoa → Lead/Negócio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir enviar documentos do acervo de uma Pessoa para um lead/negócio (tela da Pessoa), trazer documentos das pessoas participantes para dentro de um lead/negócio, e remover um vínculo sem perder o documento.

**Architecture:** Regras puras em `src/lib/documentos/vinculos.ts`; checagens de sessão/permissão/visibilidade em `src/lib/documentos/vinculosServidor.ts`; quatro rotas em `src/app/api/documentos/vinculos/` que gravam com `supabaseAdmin` depois de validar com o JWT do usuário (RLS decide visibilidade/carteira). No cliente, um hook de API e duas janelas (`EnviarDocumentosModal`, `TrazerDocumentosModal`) plugadas em `AbaDocumentos.tsx`.

**Tech Stack:** Next.js 14 (App Router, rotas `route.ts`), TypeScript, Supabase (supabase-js v2, PostgREST, RLS), TanStack Query, shadcn/ui, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-25-documentos-pessoa-vinculo-design.md`

## Global Constraints

- Sem migration. Tabelas usadas: `documentos`, `documento_vinculos` (UNIQUE `documento_id,entidade_tipo,entidade_id`), `lead_historico` (tipo `'acao_operacional'`), `processo_comentarios` (tipo `'alteracao'`), `catalogo_pastas_processo`, `catalogo_tipos_documento`.
- Nunca alterar `documentos.pessoa_id` nem copiar arquivo. Vincular = linha em `documento_vinculos`.
- Só `documentos.dominio = 'acervo_documental'`, `deleted_at IS NULL`, mesma `empresa_id`.
- Remover só `entidade_tipo IN ('lead','processo')`.
- Permissão: lead → `leads.editar`; processo → `processos.editar` (via `podeServidor`) **e** entidade visível com o JWT do usuário (RLS).
- Toda query nova checa `error` (PostgREST falha em silêncio — CLAUDE.md); DELETE/UPDATE conferem linhas afetadas com `.select(...)`.
- Leads "fechados" (fora da lista de destinos da própria pessoa): `status_analise IN ('aprovado','reprovado','convertido_em_processo','concluido','cancelado')` (mesma lista da migration 311). Processos bloqueados: `STATUS_BLOQUEADOS_PROCESSO` (`src/lib/bot/fonti-comandos.ts`: `reprovado`, `cancelado`).
- Rodar testes com `npx vitest run --exclude ".claude/**" --exclude "output/**"`. Falhas pré-existentes aceitas em `main`: `atualizar-cliente` (leads e processos), `criteria-migracao-fase4-caixa`, `mensagem-imovel-acima-teto`, `prazo-idade-renda-maxima`.
- Rodar `npx tsc --noEmit -p .` antes de cada commit de UI. Reverter mudanças acidentais em `src/lib/simuladorFinanciamento/__tests__/__snapshots__/`.
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- Enviar o mesmo documento duas vezes para o mesmo destino → não duplica e **não troca a pasta** que o operador já tinha escolhido (Task 3, teste "já existia").
- Comercial tentando vincular a um lead/negócio fora da carteira (sem `leads.ver_todas`) → 403, nada gravado (Task 3, teste de visibilidade).
- Lote misto (documento de trabalho de processo, excluído, de outra empresa, inexistente) → os válidos são vinculados e os outros voltam em `recusados` com motivo (Task 1 + Task 3).
- "Trazer das pessoas" no lead não pode listar o documento do titular que já aparece em "Sem pasta" (sem vínculo de lead), senão parece duplicado (Task 1, teste de ocultos).
- Busca de destino por `57`, `proc-57`, `#proc-057` → acha `#proc-057` (Task 5, `interpretarBuscaDestino`).

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/documentos/vinculos.ts` (novo) | Regras puras: validar lote, calcular pasta, candidatos, etiquetas, interpretar busca |
| `src/lib/documentos/vinculosServidor.ts` (novo) | Autenticação Bearer, cliente com JWT do usuário, verificação de destino, participantes |
| `src/lib/documentos/destinosVinculo.ts` (novo) | Consulta de destinos (da pessoa + busca livre) com o cliente do usuário |
| `src/app/api/documentos/vinculos/route.ts` (novo) | POST vincular, DELETE remover |
| `src/app/api/documentos/vinculos/candidatos/route.ts` (novo) | GET candidatos para "Trazer das pessoas" |
| `src/app/api/documentos/vinculos/destinos/route.ts` (novo) | GET destinos para "Enviar para…" |
| `src/lib/documentos/__tests__/helpers/fakeDb.ts` (novo) | Banco falso em memória para testes de rota |
| `src/hooks/documentos/useVinculosDocumento.ts` (novo) | Chamadas às rotas + etiquetas de vínculo (cliente) |
| `src/components/documentos/EnviarDocumentosModal.tsx` (novo) | Janela "Enviar para…" |
| `src/components/documentos/TrazerDocumentosModal.tsx` (novo) | Janela "Trazer das pessoas" |
| `src/components/documentos/AbaDocumentos.tsx` (modificar) | Seleção/etiquetas/filtro na Pessoa; botão Trazer e ação Remover no lead/processo |
| `src/components/leads/NovoProcessoModal.tsx` (modificar) | `handleVincular` usa POST |
| `src/lib/bot/fonti-comandos.ts` (modificar) | Dica no "Sem lead aberto" |
| `CLAUDE.md` (modificar) | Regra de arquitetura nova |

---

### Task 1: Regras puras de vínculo

**Files:**
- Create: `src/lib/documentos/vinculos.ts`
- Test: `src/lib/documentos/__tests__/vinculos.test.ts`

**Interfaces:**
- Consumes: `inferirPastaSugerida` (`src/lib/documentos.ts`).
- Produces:
  ```ts
  export type EntidadeVinculo = 'lead' | 'processo'
  export type MotivoRecusa = 'nao_encontrado' | 'outra_empresa' | 'documento_de_trabalho' | 'excluido'
  export interface DocVinculavel { id: string; empresa_id: string; dominio: string; deleted_at: string | null; pessoa_id: string | null; classificacao_legado: string | null }
  export function separarDocumentosVinculaveis(pedidos: string[], docs: DocVinculavel[], empresaId: string): { aceitos: DocVinculavel[]; recusados: { documento_id: string; motivo: MotivoRecusa }[] }
  export function calcularPastaIdDoVinculo(input: { doc: Pick<DocVinculavel, 'pessoa_id' | 'classificacao_legado'>; compradorasIds: string[]; vendedorasIds: string[]; pastaDoLeadCodigo: string | null; pastaDoTipoPorCodigo: Map<string, string | null>; pastaIdPorCodigo: Map<string, string> }): string | null
  export function filtrarCandidatosParaTrazer<T extends { id: string }>(docs: T[], idsJaAqui: Set<string>, idsOcultos: Set<string>): T[]
  export interface EtiquetaVinculo { tipo: EntidadeVinculo; entidade_id: string; texto: string }
  export function montarEtiquetasVinculo(vinculos: { documento_id: string; entidade_tipo: string; entidade_id: string }[], leads: Map<string, string | null>, processos: Map<string, string>): Map<string, EtiquetaVinculo[]>
  export function interpretarBuscaDestino(busca: string): { numeroProcesso: string | null; texto: string | null }
  ```

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/documentos/__tests__/vinculos.test.ts
import { describe, it, expect } from 'vitest'
import {
  separarDocumentosVinculaveis, calcularPastaIdDoVinculo, filtrarCandidatosParaTrazer,
  montarEtiquetasVinculo, interpretarBuscaDestino, type DocVinculavel,
} from '../vinculos'

const doc = (p: Partial<DocVinculavel> & { id: string }): DocVinculavel => ({
  empresa_id: 'e1', dominio: 'acervo_documental', deleted_at: null, pessoa_id: 'p1', classificacao_legado: null, ...p,
})

describe('separarDocumentosVinculaveis', () => {
  it('aceita acervo da empresa e recusa o resto com motivo', () => {
    const r = separarDocumentosVinculaveis(
      ['ok', 'trab', 'exc', 'outra', 'sumiu', 'ok'],
      [doc({ id: 'ok' }), doc({ id: 'trab', dominio: 'processo_trabalho' }), doc({ id: 'exc', deleted_at: '2026-09-01' }), doc({ id: 'outra', empresa_id: 'e2' })],
      'e1',
    )
    expect(r.aceitos.map(d => d.id)).toEqual(['ok'])
    expect(r.recusados).toEqual([
      { documento_id: 'trab', motivo: 'documento_de_trabalho' },
      { documento_id: 'exc', motivo: 'excluido' },
      { documento_id: 'outra', motivo: 'outra_empresa' },
      { documento_id: 'sumiu', motivo: 'nao_encontrado' },
    ])
  })
})

describe('calcularPastaIdDoVinculo', () => {
  const pastaIdPorCodigo = new Map([['comprador', 'pasta-comp'], ['vendedor', 'pasta-vend'], ['renda', 'pasta-renda'], ['imovel', 'pasta-imovel']])
  const pastaDoTipoPorCodigo = new Map<string, string | null>([['comprovante_renda', 'renda']])
  it('pasta do lead vence', () => {
    expect(calcularPastaIdDoVinculo({ doc: { pessoa_id: 'p1', classificacao_legado: 'comprovante_renda' }, compradorasIds: ['p1'], vendedorasIds: [], pastaDoLeadCodigo: 'imovel', pastaDoTipoPorCodigo, pastaIdPorCodigo })).toBe('pasta-imovel')
  })
  it('papel no processo vem antes do tipo', () => {
    expect(calcularPastaIdDoVinculo({ doc: { pessoa_id: 'p9', classificacao_legado: 'comprovante_renda' }, compradorasIds: [], vendedorasIds: ['p9'], pastaDoLeadCodigo: null, pastaDoTipoPorCodigo, pastaIdPorCodigo })).toBe('pasta-vend')
  })
  it('sem papel usa o tipo; sem nada devolve null', () => {
    expect(calcularPastaIdDoVinculo({ doc: { pessoa_id: 'px', classificacao_legado: 'comprovante_renda' }, compradorasIds: [], vendedorasIds: [], pastaDoLeadCodigo: null, pastaDoTipoPorCodigo, pastaIdPorCodigo })).toBe('pasta-renda')
    expect(calcularPastaIdDoVinculo({ doc: { pessoa_id: 'px', classificacao_legado: null }, compradorasIds: [], vendedorasIds: [], pastaDoLeadCodigo: null, pastaDoTipoPorCodigo, pastaIdPorCodigo })).toBeNull()
  })
})

describe('filtrarCandidatosParaTrazer', () => {
  it('tira o que já está aqui e os ocultos (titular do lead sem vínculo já aparece em Sem pasta)', () => {
    const r = filtrarCandidatosParaTrazer([{ id: 'a' }, { id: 'b' }, { id: 'c' }], new Set(['a']), new Set(['b']))
    expect(r.map(d => d.id)).toEqual(['c'])
  })
})

describe('montarEtiquetasVinculo', () => {
  it('etiqueta lead com fase e processo com número; ignora anexos de nota', () => {
    const m = montarEtiquetasVinculo(
      [
        { documento_id: 'd1', entidade_tipo: 'lead', entidade_id: 'l1' },
        { documento_id: 'd1', entidade_tipo: 'processo', entidade_id: 'pr1' },
        { documento_id: 'd2', entidade_tipo: 'lead_historico', entidade_id: 'h1' },
        { documento_id: 'd3', entidade_tipo: 'lead', entidade_id: 'l-oculto' },
      ],
      new Map([['l1', 'Captação']]),
      new Map([['pr1', '#proc-057']]),
    )
    expect(m.get('d1')).toEqual([
      { tipo: 'lead', entidade_id: 'l1', texto: 'Lead · Captação' },
      { tipo: 'processo', entidade_id: 'pr1', texto: '#proc-057' },
    ])
    expect(m.get('d2')).toBeUndefined()
    // Lead que o usuário não enxerga (carteira): etiqueta genérica, sem nome da fase.
    expect(m.get('d3')).toEqual([{ tipo: 'lead', entidade_id: 'l-oculto', texto: 'Lead' }])
  })
})

describe('interpretarBuscaDestino', () => {
  it.each([['57', '#proc-057'], ['proc-57', '#proc-057'], ['#proc-057', '#proc-057'], ['#57', '#proc-057'], ['1234', '#proc-1234']])('%s → número de processo', (b, n) => {
    expect(interpretarBuscaDestino(b)).toEqual({ numeroProcesso: n, texto: null })
  })
  it('texto vira busca por nome; curto demais vira nada', () => {
    expect(interpretarBuscaDestino('  joao ')).toEqual({ numeroProcesso: null, texto: 'joao' })
    expect(interpretarBuscaDestino('j')).toEqual({ numeroProcesso: null, texto: null })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/documentos/__tests__/vinculos.test.ts`
Expected: FAIL — `Failed to resolve import "../vinculos"`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/documentos/vinculos.ts
/**
 * Regras puras de "documento da Pessoa → Lead/Negócio" (spec
 * docs/superpowers/specs/2026-09-25-documentos-pessoa-vinculo-design.md).
 * Sem I/O: as rotas buscam os dados e aplicam o que estas funções decidem.
 * Vincular nunca muda o dono do documento (documentos.pessoa_id) — CLAUDE.md, invariante 2.
 */
import { inferirPastaSugerida } from '@/lib/documentos'

export type EntidadeVinculo = 'lead' | 'processo'
export type MotivoRecusa = 'nao_encontrado' | 'outra_empresa' | 'documento_de_trabalho' | 'excluido'

export interface DocVinculavel {
  id: string
  empresa_id: string
  dominio: string
  deleted_at: string | null
  pessoa_id: string | null
  classificacao_legado: string | null
}

/** Só acervo da própria empresa, não excluído. Pedidos repetidos contam uma vez. */
export function separarDocumentosVinculaveis(
  pedidos: string[],
  docs: DocVinculavel[],
  empresaId: string,
): { aceitos: DocVinculavel[]; recusados: { documento_id: string; motivo: MotivoRecusa }[] } {
  const porId = new Map(docs.map(d => [d.id, d]))
  const aceitos: DocVinculavel[] = []
  const recusados: { documento_id: string; motivo: MotivoRecusa }[] = []
  for (const id of Array.from(new Set(pedidos))) {
    const d = porId.get(id)
    if (!d) recusados.push({ documento_id: id, motivo: 'nao_encontrado' })
    else if (d.empresa_id !== empresaId) recusados.push({ documento_id: id, motivo: 'outra_empresa' })
    else if (d.dominio !== 'acervo_documental') recusados.push({ documento_id: id, motivo: 'documento_de_trabalho' })
    else if (d.deleted_at) recusados.push({ documento_id: id, motivo: 'excluido' })
    else aceitos.push(d)
  }
  return { aceitos, recusados }
}

/** Mesma prioridade da conversão lead → negócio (inferirPastaSugerida), devolvendo o id da pasta. */
export function calcularPastaIdDoVinculo(input: {
  doc: Pick<DocVinculavel, 'pessoa_id' | 'classificacao_legado'>
  compradorasIds: string[]
  vendedorasIds: string[]
  pastaDoLeadCodigo: string | null
  pastaDoTipoPorCodigo: Map<string, string | null>
  pastaIdPorCodigo: Map<string, string>
}): string | null {
  const codigo = inferirPastaSugerida({
    documentoPessoaId: input.doc.pessoa_id,
    pastaSugeridaCodigoDoTipo: input.doc.classificacao_legado
      ? input.pastaDoTipoPorCodigo.get(input.doc.classificacao_legado) ?? null
      : null,
    pessoasCompradorasIds: input.compradorasIds,
    pessoasVendedorasIds: input.vendedorasIds,
    pastaDoLeadCodigo: input.pastaDoLeadCodigo,
  })
  return codigo ? input.pastaIdPorCodigo.get(codigo) ?? null : null
}

/** "Trazer das pessoas": tira o que já está vinculado aqui e o que já aparece na aba por outro caminho. */
export function filtrarCandidatosParaTrazer<T extends { id: string }>(docs: T[], idsJaAqui: Set<string>, idsOcultos: Set<string>): T[] {
  return docs.filter(d => !idsJaAqui.has(d.id) && !idsOcultos.has(d.id))
}

export interface EtiquetaVinculo { tipo: EntidadeVinculo; entidade_id: string; texto: string }

/**
 * Etiquetas "onde este documento está" na tela da Pessoa. `leads`: id → nome da fase
 * (só os que o usuário enxerga); `processos`: id → número. Anexos de nota/comentário não
 * contam como "estar" num lead/negócio.
 */
export function montarEtiquetasVinculo(
  vinculos: { documento_id: string; entidade_tipo: string; entidade_id: string }[],
  leads: Map<string, string | null>,
  processos: Map<string, string>,
): Map<string, EtiquetaVinculo[]> {
  const m = new Map<string, EtiquetaVinculo[]>()
  for (const v of vinculos) {
    let etiqueta: EtiquetaVinculo | null = null
    if (v.entidade_tipo === 'lead') {
      const fase = leads.get(v.entidade_id)
      etiqueta = { tipo: 'lead', entidade_id: v.entidade_id, texto: fase ? `Lead · ${fase}` : 'Lead' }
    } else if (v.entidade_tipo === 'processo') {
      etiqueta = { tipo: 'processo', entidade_id: v.entidade_id, texto: processos.get(v.entidade_id) ?? 'Negócio' }
    }
    if (!etiqueta) continue
    m.set(v.documento_id, [...(m.get(v.documento_id) ?? []), etiqueta])
  }
  return m
}

/** "57", "proc-57", "#proc-057", "#57" → "#proc-057"; texto com 2+ letras → busca por nome. */
export function interpretarBuscaDestino(busca: string): { numeroProcesso: string | null; texto: string | null } {
  const b = busca.trim()
  const num = b.match(/^#?(?:proc-)?0*(\d+)$/i)
  if (num) return { numeroProcesso: `#proc-${num[1].padStart(3, '0')}`, texto: null }
  return { numeroProcesso: null, texto: b.length >= 2 ? b : null }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/documentos/__tests__/vinculos.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add src/lib/documentos/vinculos.ts src/lib/documentos/__tests__/vinculos.test.ts
git commit -m "feat(documentos): regras puras de vínculo pessoa → lead/negócio

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Helpers de servidor + banco falso de teste

**Files:**
- Create: `src/lib/documentos/vinculosServidor.ts`
- Create: `src/lib/documentos/__tests__/helpers/fakeDb.ts`
- Test: `src/lib/documentos/__tests__/vinculosServidor.test.ts`

**Interfaces:**
- Consumes: `supabaseAdmin` (`@/lib/supabase/admin`), `podeServidor` (`@/lib/auth/resolverPermissaoServidor`), `UsuarioPerfil` (`@/types/auth`), `EntidadeVinculo` (Task 1).
- Produces:
  ```ts
  export interface UsuarioRota { id: string; empresa_id: string; perfil: UsuarioPerfil; nome: string }
  export interface ContextoRota { usuario: UsuarioRota; token: string }
  export async function autenticarRota(request: NextRequest): Promise<ContextoRota | NextResponse>
  export function clienteDoUsuario(token: string): SupabaseClient
  export async function verificarDestino(ctx: ContextoRota, entidadeTipo: EntidadeVinculo, entidadeId: string, cliente?: SupabaseClient): Promise<NextResponse | null>  // null = ok
  export interface Participantes { pessoaIds: string[]; compradorasIds: string[]; vendedorasIds: string[]; titularLeadPessoaId: string | null }
  export async function participantesDaEntidade(entidadeTipo: EntidadeVinculo, entidadeId: string, empresaId: string): Promise<Participantes>
  // fakeDb.ts
  export function criarFakeDb(tabelas: Record<string, Row[]>, opts?: { unicos?: Record<string, string[]> }): { from(t: string): any; tabelas: Record<string, Row[]> }
  ```

- [ ] **Step 1: Write the fake DB helper**

```ts
// src/lib/documentos/__tests__/helpers/fakeDb.ts
/* Banco falso em memória para testes de rota: encadeia filtros e resolve como thenable.
 * Suporta select/insert/upsert(ignoreDuplicates)/delete/update, eq/neq/in/is/not(in)/ilike/or(ignorado),
 * order/limit (limit aplicado), maybeSingle/single. `unicos` define a chave única por tabela. */
export type Row = Record<string, unknown>

export function criarFakeDb(tabelas: Record<string, Row[]>, opts: { unicos?: Record<string, string[]> } = {}) {
  const from = (tabela: string) => {
    const filtros: Array<(r: Row) => boolean> = []
    let op: 'select' | 'insert' | 'upsert' | 'delete' | 'update' = 'select'
    let linhasNovas: Row[] = []
    let patch: Row = {}
    let ignorar = false
    let limite: number | null = null
    const lista = () => (tabelas[tabela] ??= [])
    const chave = (r: Row) => (opts.unicos?.[tabela] ?? ['id']).map(c => String(r[c])).join('|')
    const executar = () => {
      if (op === 'insert') { lista().push(...linhasNovas); return { data: linhasNovas, error: null } }
      if (op === 'upsert') {
        const inseridas: Row[] = []
        for (const n of linhasNovas) {
          const existente = lista().find(r => chave(r) === chave(n))
          if (existente) { if (!ignorar) Object.assign(existente, n) }
          else { lista().push({ ...n }); inseridas.push(n) }
        }
        return { data: inseridas, error: null }
      }
      let alvo = lista().filter(r => filtros.every(f => f(r)))
      if (op === 'delete') { tabelas[tabela] = lista().filter(r => !alvo.includes(r)); return { data: alvo, error: null } }
      if (op === 'update') alvo.forEach(r => Object.assign(r, patch))
      if (limite != null) alvo = alvo.slice(0, limite)
      return { data: alvo, error: null }
    }
    const b: Record<string, unknown> = {
      select: () => b,
      insert: (r: Row | Row[]) => { op = 'insert'; linhasNovas = Array.isArray(r) ? r : [r]; return b },
      upsert: (r: Row | Row[], o?: { ignoreDuplicates?: boolean }) => { op = 'upsert'; linhasNovas = Array.isArray(r) ? r : [r]; ignorar = !!o?.ignoreDuplicates; return b },
      delete: () => { op = 'delete'; return b },
      update: (p: Row) => { op = 'update'; patch = p; return b },
      eq: (c: string, v: unknown) => { filtros.push(r => r[c] === v); return b },
      neq: (c: string, v: unknown) => { filtros.push(r => r[c] !== v); return b },
      in: (c: string, vs: unknown[]) => { filtros.push(r => vs.includes(r[c])); return b },
      is: (c: string, v: unknown) => { filtros.push(r => (r[c] ?? null) === v); return b },
      not: (c: string, operador: string, v: string) => {
        if (operador === 'in') { const vs = v.replace(/[()]/g, '').split(','); filtros.push(r => !vs.includes(String(r[c]))) }
        if (operador === 'is') filtros.push(r => (r[c] ?? null) !== null)
        return b
      },
      ilike: (c: string, padrao: string) => { const t = padrao.replace(/%/g, '').toLowerCase(); filtros.push(r => String(r[c] ?? '').toLowerCase().includes(t)); return b },
      or: () => b,
      order: () => b,
      limit: (n: number) => { limite = n; return b },
      abortSignal: () => b,
      maybeSingle: () => Promise.resolve({ data: executar().data?.[0] ?? null, error: null }),
      single: () => Promise.resolve({ data: executar().data?.[0] ?? null, error: null }),
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(executar()).then(res, rej),
    }
    return b
  }
  return { from, tabelas }
}
```

- [ ] **Step 2: Write the failing test**

```ts
// src/lib/documentos/__tests__/vinculosServidor.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { criarFakeDb, type Row } from './helpers/fakeDb'

const estado = vi.hoisted(() => ({ tabelas: {} as Record<string, Row[]>, pode: true }))

vi.mock('@/lib/supabase/admin', async () => {
  const { criarFakeDb } = await import('./helpers/fakeDb')
  return { supabaseAdmin: { from: (t: string) => criarFakeDb(estado.tabelas).from(t) } }
})
vi.mock('@/lib/auth/resolverPermissaoServidor', () => ({ podeServidor: async () => estado.pode }))

beforeEach(() => {
  estado.pode = true
  estado.tabelas = {
    leads: [{ id: 'l1', empresa_id: 'e1', pessoa_id: 'titular', conjuge_pessoa_id: 'conj', deleted_at: null }],
    processo_compradores: [{ processo_id: 'pr1', empresa_id: 'e1', pessoa_id: 'comp' }, { processo_id: 'pr1', empresa_id: 'e1', pessoa_id: null }],
    processo_vendedores: [{ processo_id: 'pr1', empresa_id: 'e1', pessoa_id: 'vend' }],
  }
})

const ctx = { usuario: { id: 'u1', empresa_id: 'e1', perfil: 'comercial' as const, nome: 'Ana' }, token: 't' }

describe('verificarDestino', () => {
  it('ok quando pode editar e enxerga', async () => {
    const { verificarDestino } = await import('../vinculosServidor')
    const cliente = criarFakeDb({ processos: [{ id: 'pr1', deleted_at: null }] }) as never
    expect(await verificarDestino(ctx, 'processo', 'pr1', cliente)).toBeNull()
  })
  it('403 sem permissão de editar', async () => {
    estado.pode = false
    const { verificarDestino } = await import('../vinculosServidor')
    const cliente = criarFakeDb({ processos: [{ id: 'pr1', deleted_at: null }] }) as never
    expect((await verificarDestino(ctx, 'processo', 'pr1', cliente))?.status).toBe(403)
  })
  it('403 quando a RLS esconde o lead (fora da carteira)', async () => {
    const { verificarDestino } = await import('../vinculosServidor')
    const cliente = criarFakeDb({ leads: [] }) as never
    expect((await verificarDestino(ctx, 'lead', 'l1', cliente))?.status).toBe(403)
  })
})

describe('participantesDaEntidade', () => {
  it('lead: titular + cônjuge', async () => {
    const { participantesDaEntidade } = await import('../vinculosServidor')
    expect(await participantesDaEntidade('lead', 'l1', 'e1')).toEqual({
      pessoaIds: ['titular', 'conj'], compradorasIds: [], vendedorasIds: [], titularLeadPessoaId: 'titular',
    })
  })
  it('processo: compradores + vendedores, sem nulos', async () => {
    const { participantesDaEntidade } = await import('../vinculosServidor')
    expect(await participantesDaEntidade('processo', 'pr1', 'e1')).toEqual({
      pessoaIds: ['comp', 'vend'], compradorasIds: ['comp'], vendedorasIds: ['vend'], titularLeadPessoaId: null,
    })
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/documentos/__tests__/vinculosServidor.test.ts`
Expected: FAIL — `Failed to resolve import "../vinculosServidor"`.

- [ ] **Step 4: Write minimal implementation**

```ts
// src/lib/documentos/vinculosServidor.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { supabaseAdmin as supabase } from '@/lib/supabase/admin'
import { podeServidor } from '@/lib/auth/resolverPermissaoServidor'
import type { UsuarioPerfil } from '@/types/auth'
import type { EntidadeVinculo } from '@/lib/documentos/vinculos'

export interface UsuarioRota { id: string; empresa_id: string; perfil: UsuarioPerfil; nome: string }
export interface ContextoRota { usuario: UsuarioRota; token: string }

/** Bearer da sessão do navegador → usuário interno ativo (mesmo padrão de resolverUsuarioELead). */
export async function autenticarRota(request: NextRequest): Promise<ContextoRota | NextResponse> {
  const token = request.headers.get('authorization')?.replace('Bearer ', '').trim() ?? ''
  if (!token) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const { data: usuario } = await supabase
    .from('usuarios').select('id, empresa_id, perfil, nome')
    .eq('auth_user_id', user.id).eq('ativo', true).maybeSingle()
  if (!usuario) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  return { usuario: usuario as UsuarioRota, token }
}

/** Cliente com o JWT do usuário: a RLS decide o que ele enxerga (carteira comercial). */
export function clienteDoUsuario(token: string): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** null = pode alterar; senão a resposta de erro pronta. `cliente` só é injetado em teste. */
export async function verificarDestino(
  ctx: ContextoRota,
  entidadeTipo: EntidadeVinculo,
  entidadeId: string,
  cliente: SupabaseClient = clienteDoUsuario(ctx.token),
): Promise<NextResponse | null> {
  const acao = entidadeTipo === 'lead' ? 'leads.editar' : 'processos.editar'
  const negado = NextResponse.json(
    { error: `Você não pode alterar este ${entidadeTipo === 'lead' ? 'lead' : 'negócio'}.` },
    { status: 403 },
  )
  if (!await podeServidor(ctx.usuario.id, ctx.usuario.perfil, ctx.usuario.empresa_id, acao)) return negado
  const tabela = entidadeTipo === 'lead' ? 'leads' : 'processos'
  const { data, error } = await cliente.from(tabela).select('id').eq('id', entidadeId).is('deleted_at', null).maybeSingle()
  if (error) {
    console.error('[documentos/vinculos] erro ao checar visibilidade:', error.message)
    return NextResponse.json({ error: 'Não foi possível verificar o destino.' }, { status: 500 })
  }
  return data ? null : negado
}

export interface Participantes { pessoaIds: string[]; compradorasIds: string[]; vendedorasIds: string[]; titularLeadPessoaId: string | null }

/** Pessoas do lead (titular + cônjuge) ou do negócio (compradores, inclui cônjuge/coparticipante, + vendedores). */
export async function participantesDaEntidade(entidadeTipo: EntidadeVinculo, entidadeId: string, empresaId: string): Promise<Participantes> {
  if (entidadeTipo === 'lead') {
    const { data: lead, error } = await supabase.from('leads').select('pessoa_id, conjuge_pessoa_id')
      .eq('id', entidadeId).eq('empresa_id', empresaId).maybeSingle()
    if (error) throw new Error(`leads: ${error.message}`)
    const ids = [lead?.pessoa_id, lead?.conjuge_pessoa_id].filter((x): x is string => !!x)
    return { pessoaIds: Array.from(new Set(ids)), compradorasIds: [], vendedorasIds: [], titularLeadPessoaId: lead?.pessoa_id ?? null }
  }
  const [{ data: comp, error: e1 }, { data: vend, error: e2 }] = await Promise.all([
    supabase.from('processo_compradores').select('pessoa_id').eq('processo_id', entidadeId).eq('empresa_id', empresaId),
    supabase.from('processo_vendedores').select('pessoa_id').eq('processo_id', entidadeId).eq('empresa_id', empresaId),
  ])
  if (e1 || e2) throw new Error(`participantes: ${(e1 ?? e2)!.message}`)
  const compradorasIds = (comp ?? []).map(c => c.pessoa_id as string | null).filter((x): x is string => !!x)
  const vendedorasIds = (vend ?? []).map(v => v.pessoa_id as string | null).filter((x): x is string => !!x)
  return { pessoaIds: Array.from(new Set([...compradorasIds, ...vendedorasIds])), compradorasIds, vendedorasIds, titularLeadPessoaId: null }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/documentos/__tests__/vinculosServidor.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/documentos/vinculosServidor.ts src/lib/documentos/__tests__/helpers/fakeDb.ts src/lib/documentos/__tests__/vinculosServidor.test.ts
git commit -m "feat(documentos): helpers de servidor para vínculos (sessão, destino, participantes)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Rota POST (vincular) e DELETE (remover)

**Files:**
- Create: `src/app/api/documentos/vinculos/route.ts`
- Test: `src/app/api/documentos/vinculos/__tests__/route.test.ts`

**Interfaces:**
- Consumes: Task 1 (`separarDocumentosVinculaveis`, `calcularPastaIdDoVinculo`, `EntidadeVinculo`), Task 2 (`autenticarRota`, `verificarDestino`, `participantesDaEntidade`).
- Produces:
  - `POST /api/documentos/vinculos` body `{ documento_ids: string[]; entidade_tipo: 'lead'|'processo'; entidade_id: string }` → `200 { vinculados: number; ja_existiam: number; recusados: { documento_id: string; motivo: MotivoRecusa }[] }`; `400` body inválido; `401`; `403`; `500`.
  - `DELETE /api/documentos/vinculos` body `{ documento_id: string; entidade_tipo: 'lead'|'processo'; entidade_id: string }` → `200 { ok: true }`; `404` vínculo inexistente.

- [ ] **Step 1: Write the failing test**

```ts
// src/app/api/documentos/vinculos/__tests__/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import type { Row } from '@/lib/documentos/__tests__/helpers/fakeDb'

const estado = vi.hoisted(() => ({ tabelas: {} as Record<string, Row[]>, destinoNegado: false }))

vi.mock('@/lib/supabase/admin', async () => {
  const { criarFakeDb } = await import('@/lib/documentos/__tests__/helpers/fakeDb')
  return {
    supabaseAdmin: {
      from: (t: string) => criarFakeDb(estado.tabelas, { unicos: { documento_vinculos: ['documento_id', 'entidade_tipo', 'entidade_id'] } }).from(t),
    },
  }
})
vi.mock('@/lib/documentos/vinculosServidor', () => ({
  autenticarRota: async () => ({ usuario: { id: 'u1', empresa_id: 'e1', perfil: 'comercial', nome: 'Ana' }, token: 't' }),
  verificarDestino: async () => estado.destinoNegado ? NextResponse.json({ error: 'x' }, { status: 403 }) : null,
  participantesDaEntidade: async () => ({ pessoaIds: ['comp'], compradorasIds: ['comp'], vendedorasIds: [], titularLeadPessoaId: null }),
}))

const doc = (id: string, extra: Row = {}): Row => ({
  id, empresa_id: 'e1', dominio: 'acervo_documental', deleted_at: null, pessoa_id: 'comp', classificacao_legado: 'rg', nome_original: `${id}.pdf`, nome_exibicao: null, ...extra,
})

beforeEach(() => {
  estado.destinoNegado = false
  estado.tabelas = {
    documentos: [doc('d1'), doc('d2'), doc('trab', { dominio: 'processo_trabalho' }), doc('outra', { empresa_id: 'e2' })],
    documento_vinculos: [{ id: 'v0', empresa_id: 'e1', documento_id: 'd2', entidade_tipo: 'processo', entidade_id: 'pr1', pasta_id: 'escolhida-pelo-operador' }],
    catalogo_pastas_processo: [{ id: 'pasta-comp', codigo: 'comprador' }],
    catalogo_tipos_documento: [{ codigo: 'rg', pasta_sugerida_codigo: 'comprador' }],
    lead_historico: [],
    processo_comentarios: [],
  }
})

const req = (method: 'POST' | 'DELETE', body: unknown) => new NextRequest('http://localhost/api/documentos/vinculos', {
  method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer t' }, body: JSON.stringify(body),
})

describe('POST /api/documentos/vinculos', () => {
  it('vincula válidos com pasta, conta os que já existiam e recusa o resto sem mexer no dono', async () => {
    const { POST } = await import('../route')
    const res = await POST(req('POST', { documento_ids: ['d1', 'd2', 'trab', 'outra'], entidade_tipo: 'processo', entidade_id: 'pr1' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      vinculados: 1, ja_existiam: 1,
      recusados: [{ documento_id: 'trab', motivo: 'documento_de_trabalho' }, { documento_id: 'outra', motivo: 'outra_empresa' }],
    })
    const vinc = estado.tabelas.documento_vinculos
    expect(vinc.find(v => v.documento_id === 'd1')).toMatchObject({ entidade_tipo: 'processo', entidade_id: 'pr1', pasta_id: 'pasta-comp', vinculado_por: 'u1', empresa_id: 'e1' })
    // Já existia: pasta escolhida pelo operador preservada.
    expect(vinc.find(v => v.documento_id === 'd2')?.pasta_id).toBe('escolhida-pelo-operador')
    expect(estado.tabelas.documentos.every(d => d.pessoa_id === 'comp' || d.id === 'outra')).toBe(true)
  })

  it('403 do destino: nada gravado', async () => {
    estado.destinoNegado = true
    const { POST } = await import('../route')
    const res = await POST(req('POST', { documento_ids: ['d1'], entidade_tipo: 'lead', entidade_id: 'l1' }))
    expect(res.status).toBe(403)
    expect(estado.tabelas.documento_vinculos).toHaveLength(1)
  })

  it('400 com entidade_tipo inválido ou lista vazia', async () => {
    const { POST } = await import('../route')
    expect((await POST(req('POST', { documento_ids: ['d1'], entidade_tipo: 'lead_historico', entidade_id: 'x' }))).status).toBe(400)
    expect((await POST(req('POST', { documento_ids: [], entidade_tipo: 'lead', entidade_id: 'l1' }))).status).toBe(400)
  })
})

describe('DELETE /api/documentos/vinculos', () => {
  it('remove só o vínculo, mantém o documento e registra no histórico do negócio', async () => {
    const { DELETE } = await import('../route')
    const res = await DELETE(req('DELETE', { documento_id: 'd2', entidade_tipo: 'processo', entidade_id: 'pr1' }))
    expect(res.status).toBe(200)
    expect(estado.tabelas.documento_vinculos).toHaveLength(0)
    expect(estado.tabelas.documentos.find(d => d.id === 'd2')?.deleted_at).toBeNull()
    expect(estado.tabelas.processo_comentarios[0]).toMatchObject({ processo_id: 'pr1', usuario_id: 'u1', tipo: 'alteracao' })
    expect(String(estado.tabelas.processo_comentarios[0].texto)).toContain('d2.pdf')
  })

  it('lead: registra em lead_historico', async () => {
    estado.tabelas.documento_vinculos.push({ id: 'v1', empresa_id: 'e1', documento_id: 'd1', entidade_tipo: 'lead', entidade_id: 'l1', pasta_id: null })
    const { DELETE } = await import('../route')
    await DELETE(req('DELETE', { documento_id: 'd1', entidade_tipo: 'lead', entidade_id: 'l1' }))
    expect(estado.tabelas.lead_historico[0]).toMatchObject({ lead_id: 'l1', tipo: 'acao_operacional', usuario_id: 'u1' })
  })

  it('404 quando o vínculo não existe', async () => {
    const { DELETE } = await import('../route')
    expect((await DELETE(req('DELETE', { documento_id: 'd1', entidade_tipo: 'processo', entidade_id: 'pr1' }))).status).toBe(404)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/documentos/vinculos/__tests__/route.test.ts`
Expected: FAIL — `Failed to resolve import "../route"`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/app/api/documentos/vinculos/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase/admin'
import { autenticarRota, verificarDestino, participantesDaEntidade } from '@/lib/documentos/vinculosServidor'
import { separarDocumentosVinculaveis, calcularPastaIdDoVinculo, type DocVinculavel, type EntidadeVinculo } from '@/lib/documentos/vinculos'

/**
 * Documento da Pessoa → Lead/Negócio (spec 2026-09-25-documentos-pessoa-vinculo-design.md).
 * POST cria vínculos (nunca muda o dono do documento nem sobrescreve a pasta de um
 * vínculo que já existia); DELETE tira só o vínculo e registra no histórico.
 */
const TIPOS: EntidadeVinculo[] = ['lead', 'processo']
const LIMITE_LOTE = 50

function entidadeValida(tipo: unknown, id: unknown): tipo is EntidadeVinculo {
  return TIPOS.includes(tipo as EntidadeVinculo) && typeof id === 'string' && id.length > 0
}

export async function POST(request: NextRequest) {
  const ctx = await autenticarRota(request)
  if (ctx instanceof NextResponse) return ctx
  const body = await request.json().catch(() => ({})) as { documento_ids?: unknown; entidade_tipo?: unknown; entidade_id?: unknown }
  const ids = Array.isArray(body.documento_ids) ? body.documento_ids.filter((x): x is string => typeof x === 'string') : []
  if (!entidadeValida(body.entidade_tipo, body.entidade_id) || ids.length === 0 || ids.length > LIMITE_LOTE) {
    return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 })
  }
  const entidadeTipo = body.entidade_tipo
  const entidadeId = body.entidade_id as string
  const empresaId = ctx.usuario.empresa_id

  const negado = await verificarDestino(ctx, entidadeTipo, entidadeId)
  if (negado) return negado

  const { data: docs, error: eDocs } = await supabase.from('documentos')
    .select('id, empresa_id, dominio, deleted_at, pessoa_id, classificacao_legado').in('id', ids)
  if (eDocs) return erro500('documentos', eDocs.message)
  const { aceitos, recusados } = separarDocumentosVinculaveis(ids, (docs ?? []) as DocVinculavel[], empresaId)
  if (aceitos.length === 0) return NextResponse.json({ vinculados: 0, ja_existiam: 0, recusados })

  const aceitosIds = aceitos.map(d => d.id)
  const [participantes, pastas, tipos, vincLead] = await Promise.all([
    participantesDaEntidade(entidadeTipo, entidadeId, empresaId),
    supabase.from('catalogo_pastas_processo').select('id, codigo'),
    supabase.from('catalogo_tipos_documento').select('codigo, pasta_sugerida_codigo'),
    supabase.from('documento_vinculos').select('documento_id, pasta_id')
      .eq('entidade_tipo', 'lead').in('documento_id', aceitosIds).not('pasta_id', 'is', null),
  ])
  const falha = pastas.error ?? tipos.error ?? vincLead.error
  if (falha) return erro500('catálogos', falha.message)

  const pastaIdPorCodigo = new Map((pastas.data ?? []).map(p => [p.codigo as string, p.id as string]))
  const codigoPorPastaId = new Map((pastas.data ?? []).map(p => [p.id as string, p.codigo as string]))
  const pastaDoTipoPorCodigo = new Map((tipos.data ?? []).map(t => [t.codigo as string, (t.pasta_sugerida_codigo as string | null) ?? null]))
  const pastaLeadPorDoc = new Map((vincLead.data ?? []).map(v => [v.documento_id as string, codigoPorPastaId.get(v.pasta_id as string) ?? null]))

  const linhas = aceitos.map(d => ({
    empresa_id: empresaId,
    documento_id: d.id,
    entidade_tipo: entidadeTipo,
    entidade_id: entidadeId,
    vinculado_por: ctx.usuario.id,
    pasta_id: calcularPastaIdDoVinculo({
      doc: d,
      compradorasIds: participantes.compradorasIds,
      vendedorasIds: participantes.vendedorasIds,
      pastaDoLeadCodigo: pastaLeadPorDoc.get(d.id) ?? null,
      pastaDoTipoPorCodigo,
      pastaIdPorCodigo,
    }),
  }))
  // ignoreDuplicates: vínculo que já existia fica como está (pasta escolhida pelo operador).
  const { data: inseridos, error: eUp } = await supabase.from('documento_vinculos')
    .upsert(linhas, { onConflict: 'documento_id,entidade_tipo,entidade_id', ignoreDuplicates: true })
    .select('documento_id')
  if (eUp) return erro500('vincular', eUp.message)
  const vinculados = (inseridos ?? []).length
  return NextResponse.json({ vinculados, ja_existiam: aceitos.length - vinculados, recusados })
}

export async function DELETE(request: NextRequest) {
  const ctx = await autenticarRota(request)
  if (ctx instanceof NextResponse) return ctx
  const body = await request.json().catch(() => ({})) as { documento_id?: unknown; entidade_tipo?: unknown; entidade_id?: unknown }
  if (!entidadeValida(body.entidade_tipo, body.entidade_id) || typeof body.documento_id !== 'string') {
    return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 })
  }
  const entidadeTipo = body.entidade_tipo
  const entidadeId = body.entidade_id as string
  const documentoId = body.documento_id
  const empresaId = ctx.usuario.empresa_id

  const negado = await verificarDestino(ctx, entidadeTipo, entidadeId)
  if (negado) return negado

  const { data: removidos, error } = await supabase.from('documento_vinculos').delete()
    .eq('documento_id', documentoId).eq('entidade_tipo', entidadeTipo).eq('entidade_id', entidadeId).eq('empresa_id', empresaId)
    .select('id')
  if (error) return erro500('remover', error.message)
  if (!removidos || removidos.length === 0) return NextResponse.json({ error: 'Este documento não está vinculado aqui.' }, { status: 404 })

  // Histórico é secundário: falha aqui só loga, não desfaz a remoção.
  try {
    const { data: d } = await supabase.from('documentos').select('nome_original, nome_exibicao').eq('id', documentoId).maybeSingle()
    const nomeDoc = (d?.nome_exibicao ?? d?.nome_original ?? 'documento') as string
    const texto = `${ctx.usuario.nome} removeu o documento "${nomeDoc}" deste ${entidadeTipo === 'lead' ? 'lead' : 'negócio'} (o documento continua na pessoa).`
    const { error: eHist } = entidadeTipo === 'lead'
      ? await supabase.from('lead_historico').insert({ lead_id: entidadeId, empresa_id: empresaId, usuario_id: ctx.usuario.id, tipo: 'acao_operacional', descricao: texto })
      : await supabase.from('processo_comentarios').insert({ processo_id: entidadeId, empresa_id: empresaId, usuario_id: ctx.usuario.id, tipo: 'alteracao', texto })
    if (eHist) console.error('[documentos/vinculos] histórico não gravado:', eHist.message)
  } catch (err) {
    console.error('[documentos/vinculos] histórico não gravado:', err)
  }
  return NextResponse.json({ ok: true })
}

function erro500(etapa: string, msg: string) {
  console.error(`[documentos/vinculos] erro em ${etapa}:`, msg)
  return NextResponse.json({ error: 'Não foi possível concluir. Tente de novo.' }, { status: 500 })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/api/documentos/vinculos/__tests__/route.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/documentos/vinculos/route.ts src/app/api/documentos/vinculos/__tests__/route.test.ts
git commit -m "feat(documentos): rota para vincular e remover documento de lead/negócio

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Rota GET candidatos ("Trazer das pessoas")

**Files:**
- Create: `src/app/api/documentos/vinculos/candidatos/route.ts`
- Test: `src/app/api/documentos/vinculos/__tests__/candidatos.test.ts`

**Interfaces:**
- Consumes: Task 1 `filtrarCandidatosParaTrazer`; Task 2 `autenticarRota`, `verificarDestino`, `participantesDaEntidade`.
- Produces: `GET /api/documentos/vinculos/candidatos?entidade_tipo=lead|processo&entidade_id=…` →
  ```ts
  { pessoas: { pessoa_id: string; nome: string; documentos: { id: string; nome: string; classificacao: string | null; recebido_em: string }[] }[] }
  ```
  (pessoas sem candidato não aparecem; documentos mais novos primeiro).

- [ ] **Step 1: Write the failing test**

```ts
// src/app/api/documentos/vinculos/__tests__/candidatos.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import type { Row } from '@/lib/documentos/__tests__/helpers/fakeDb'

const estado = vi.hoisted(() => ({ tabelas: {} as Record<string, Row[]>, participantes: null as unknown }))

vi.mock('@/lib/supabase/admin', async () => {
  const { criarFakeDb } = await import('@/lib/documentos/__tests__/helpers/fakeDb')
  return { supabaseAdmin: { from: (t: string) => criarFakeDb(estado.tabelas).from(t) } }
})
vi.mock('@/lib/documentos/vinculosServidor', () => ({
  autenticarRota: async () => ({ usuario: { id: 'u1', empresa_id: 'e1', perfil: 'comercial', nome: 'Ana' }, token: 't' }),
  verificarDestino: async () => null,
  participantesDaEntidade: async () => estado.participantes,
}))

const d = (id: string, pessoa: string, recebido: string, extra: Row = {}): Row => ({
  id, empresa_id: 'e1', dominio: 'acervo_documental', deleted_at: null, pessoa_id: pessoa, nome_original: `${id}.pdf`, nome_exibicao: null, classificacao_legado: 'rg', recebido_em: recebido, ...extra,
})

beforeEach(() => {
  estado.tabelas = {
    pessoas: [{ id: 'titular', nome: 'Joao' }, { id: 'conj', nome: 'Maria' }],
    documentos: [
      d('t-solto', 'titular', '2026-09-01'),          // titular sem vínculo de lead → já aparece em "Sem pasta": oculto
      d('t-outro-lead', 'titular', '2026-09-02'),     // vinculado a OUTRO lead → candidato
      d('t-aqui', 'titular', '2026-09-03'),           // já vinculado a este lead → fora
      d('c1', 'conj', '2026-09-04'),                  // cônjuge → candidato
      d('c-exc', 'conj', '2026-09-05', { deleted_at: '2026-09-06' }),
    ],
    documento_vinculos: [
      { documento_id: 't-outro-lead', entidade_tipo: 'lead', entidade_id: 'l-antigo' },
      { documento_id: 't-aqui', entidade_tipo: 'lead', entidade_id: 'l1' },
    ],
  }
  estado.participantes = { pessoaIds: ['titular', 'conj'], compradorasIds: [], vendedorasIds: [], titularLeadPessoaId: 'titular' }
})

const req = (q: string) => new NextRequest(`http://localhost/api/documentos/vinculos/candidatos?${q}`, { headers: { Authorization: 'Bearer t' } })

describe('GET candidatos', () => {
  it('lead: cônjuge + titular preso a outro lead; oculta titular solto e o que já está aqui', async () => {
    const { GET } = await import('../candidatos/route')
    const res = await GET(req('entidade_tipo=lead&entidade_id=l1'))
    expect(await res.json()).toEqual({
      pessoas: [
        { pessoa_id: 'titular', nome: 'Joao', documentos: [{ id: 't-outro-lead', nome: 't-outro-lead.pdf', classificacao: 'rg', recebido_em: '2026-09-02' }] },
        { pessoa_id: 'conj', nome: 'Maria', documentos: [{ id: 'c1', nome: 'c1.pdf', classificacao: 'rg', recebido_em: '2026-09-04' }] },
      ],
    })
  })

  it('400 sem entidade válida', async () => {
    const { GET } = await import('../candidatos/route')
    expect((await GET(req('entidade_tipo=x&entidade_id=l1'))).status).toBe(400)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/documentos/vinculos/__tests__/candidatos.test.ts`
Expected: FAIL — `Failed to resolve import "../candidatos/route"`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/app/api/documentos/vinculos/candidatos/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase/admin'
import { autenticarRota, verificarDestino, participantesDaEntidade } from '@/lib/documentos/vinculosServidor'
import { filtrarCandidatosParaTrazer, type EntidadeVinculo } from '@/lib/documentos/vinculos'

/** "Trazer das pessoas": acervo das pessoas do lead/negócio que ainda não está vinculado aqui. */
export async function GET(request: NextRequest) {
  const ctx = await autenticarRota(request)
  if (ctx instanceof NextResponse) return ctx
  const q = request.nextUrl.searchParams
  const entidadeTipo = q.get('entidade_tipo') as EntidadeVinculo
  const entidadeId = q.get('entidade_id') ?? ''
  if (!['lead', 'processo'].includes(entidadeTipo) || !entidadeId) {
    return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 })
  }
  const empresaId = ctx.usuario.empresa_id
  const negado = await verificarDestino(ctx, entidadeTipo, entidadeId)
  if (negado) return negado

  const participantes = await participantesDaEntidade(entidadeTipo, entidadeId, empresaId)
  if (participantes.pessoaIds.length === 0) return NextResponse.json({ pessoas: [] })

  const [{ data: docs, error: e1 }, { data: pessoas, error: e2 }] = await Promise.all([
    supabase.from('documentos')
      .select('id, pessoa_id, nome_original, nome_exibicao, classificacao_legado, recebido_em')
      .eq('empresa_id', empresaId).eq('dominio', 'acervo_documental').is('deleted_at', null)
      .in('pessoa_id', participantes.pessoaIds).order('recebido_em', { ascending: false }),
    supabase.from('pessoas').select('id, nome').in('id', participantes.pessoaIds),
  ])
  if (e1 || e2) {
    console.error('[documentos/vinculos/candidatos]', (e1 ?? e2)!.message)
    return NextResponse.json({ error: 'Não foi possível carregar os documentos.' }, { status: 500 })
  }
  const listaDocs = docs ?? []
  if (listaDocs.length === 0) return NextResponse.json({ pessoas: [] })

  const { data: vinculos, error: e3 } = await supabase.from('documento_vinculos')
    .select('documento_id, entidade_tipo, entidade_id').in('documento_id', listaDocs.map(d => d.id as string))
  if (e3) {
    console.error('[documentos/vinculos/candidatos]', e3.message)
    return NextResponse.json({ error: 'Não foi possível carregar os documentos.' }, { status: 500 })
  }
  const idsJaAqui = new Set((vinculos ?? [])
    .filter(v => v.entidade_tipo === entidadeTipo && v.entidade_id === entidadeId).map(v => v.documento_id as string))
  // Lead: documento do titular sem vínculo de lead já aparece na aba (em "Sem pasta") — não repetir.
  const comVinculoLead = new Set((vinculos ?? [])
    .filter(v => v.entidade_tipo === 'lead' || v.entidade_tipo === 'lead_historico').map(v => v.documento_id as string))
  const idsOcultos = new Set(entidadeTipo === 'lead'
    ? listaDocs.filter(d => d.pessoa_id === participantes.titularLeadPessoaId && !comVinculoLead.has(d.id as string)).map(d => d.id as string)
    : [])

  const candidatos = filtrarCandidatosParaTrazer(listaDocs as { id: string; pessoa_id: string }[], idsJaAqui, idsOcultos)
  const nomePessoa = new Map((pessoas ?? []).map(p => [p.id as string, p.nome as string]))
  const resposta = participantes.pessoaIds
    .map(pid => ({
      pessoa_id: pid,
      nome: nomePessoa.get(pid) ?? 'Pessoa',
      documentos: candidatos.filter(c => c.pessoa_id === pid).map(c => {
        const row = c as unknown as { id: string; nome_exibicao: string | null; nome_original: string; classificacao_legado: string | null; recebido_em: string }
        return { id: row.id, nome: row.nome_exibicao ?? row.nome_original, classificacao: row.classificacao_legado, recebido_em: row.recebido_em }
      }),
    }))
    .filter(p => p.documentos.length > 0)
  return NextResponse.json({ pessoas: resposta })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/api/documentos/vinculos/__tests__/candidatos.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/documentos/vinculos/candidatos/route.ts src/app/api/documentos/vinculos/__tests__/candidatos.test.ts
git commit -m "feat(documentos): rota de candidatos para Trazer das pessoas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Rota GET destinos ("Enviar para…")

**Files:**
- Create: `src/lib/documentos/destinosVinculo.ts`
- Create: `src/app/api/documentos/vinculos/destinos/route.ts`
- Test: `src/lib/documentos/__tests__/destinosVinculo.test.ts`

**Interfaces:**
- Consumes: Task 1 `interpretarBuscaDestino`, `EntidadeVinculo`; Task 2 `autenticarRota`, `clienteDoUsuario`; `STATUS_BLOQUEADOS_PROCESSO` (`@/lib/bot/fonti-comandos`).
- Produces:
  ```ts
  export interface DestinoVinculo { entidade_tipo: EntidadeVinculo; entidade_id: string; titulo: string; subtitulo: string | null; pessoa_participa: boolean }
  export const STATUS_LEAD_FECHADO: string[]  // ['aprovado','reprovado','convertido_em_processo','concluido','cancelado']
  export async function buscarDestinos(cliente: SupabaseClient, pessoaId: string, busca: string): Promise<DestinoVinculo[]>
  ```
  `GET /api/documentos/vinculos/destinos?pessoa_id=…&busca=…` → `{ destinos: DestinoVinculo[] }` (da pessoa primeiro; depois até 10 da busca, sem repetir).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/documentos/__tests__/destinosVinculo.test.ts
import { describe, it, expect, vi } from 'vitest'
import { criarFakeDb } from './helpers/fakeDb'

vi.mock('@/lib/bot/fonti-comandos', () => ({ STATUS_BLOQUEADOS_PROCESSO: ['reprovado', 'cancelado'] }))

const base = () => criarFakeDb({
  leads: [
    { id: 'l1', nome: 'Joao do oculos', pessoa_id: 'p1', conjuge_pessoa_id: null, deleted_at: null, status_analise: 'aguardando_documentos', fase: { nome: 'Captação' } },
    { id: 'l-fechado', nome: 'Joao do oculos', pessoa_id: 'p1', conjuge_pessoa_id: null, deleted_at: null, status_analise: 'convertido_em_processo', fase: { nome: 'Convertido' } },
    { id: 'l-outro', nome: 'Joao PEde Feijao', pessoa_id: 'p2', conjuge_pessoa_id: null, deleted_at: null, status_analise: 'novo', fase: { nome: 'Captação' } },
  ],
  processo_compradores: [{ processo_id: 'pr1', pessoa_id: 'p1' }],
  processo_vendedores: [],
  processos: [
    { id: 'pr1', numero_processo: '#proc-010', deleted_at: null, status_processo: 'em_analise', banco: { nome: 'Caixa' } },
    { id: 'pr57', numero_processo: '#proc-057', deleted_at: null, status_processo: 'em_analise', banco: null },
  ],
  pessoas: [{ id: 'p1', nome: 'Joao do oculos' }, { id: 'p2', nome: 'Joao PEde Feijao' }],
})

describe('buscarDestinos', () => {
  it('sem busca: leads abertos e negócios da pessoa, marcados como participante', async () => {
    const { buscarDestinos } = await import('../destinosVinculo')
    const r = await buscarDestinos(base() as never, 'p1', '')
    expect(r).toEqual([
      { entidade_tipo: 'lead', entidade_id: 'l1', titulo: 'Lead · Joao do oculos', subtitulo: 'Captação', pessoa_participa: true },
      { entidade_tipo: 'processo', entidade_id: 'pr1', titulo: '#proc-010', subtitulo: 'Caixa', pessoa_participa: true },
    ])
  })

  it('busca por número acha negócio onde a pessoa não participa', async () => {
    const { buscarDestinos } = await import('../destinosVinculo')
    const r = await buscarDestinos(base() as never, 'p1', '57')
    expect(r.at(-1)).toEqual({ entidade_tipo: 'processo', entidade_id: 'pr57', titulo: '#proc-057', subtitulo: null, pessoa_participa: false })
  })

  it('busca por nome acha lead de outra pessoa sem repetir os da própria', async () => {
    const { buscarDestinos } = await import('../destinosVinculo')
    const r = await buscarDestinos(base() as never, 'p1', 'joao')
    expect(r.filter(d => d.entidade_id === 'l1')).toHaveLength(1)
    expect(r.find(d => d.entidade_id === 'l-outro')).toMatchObject({ pessoa_participa: false })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/documentos/__tests__/destinosVinculo.test.ts`
Expected: FAIL — `Failed to resolve import "../destinosVinculo"`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/documentos/destinosVinculo.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { STATUS_BLOQUEADOS_PROCESSO } from '@/lib/bot/fonti-comandos'
import { interpretarBuscaDestino, type EntidadeVinculo } from '@/lib/documentos/vinculos'

export interface DestinoVinculo { entidade_tipo: EntidadeVinculo; entidade_id: string; titulo: string; subtitulo: string | null; pessoa_participa: boolean }

/** Mesma lista de "lead fechado" do índice leads_pessoa_aberto_unico (migration 311). */
export const STATUS_LEAD_FECHADO = ['aprovado', 'reprovado', 'convertido_em_processo', 'concluido', 'cancelado']
const LIMITE_BUSCA = 10

type LeadRow = { id: string; nome: string | null; fase: { nome: string } | { nome: string }[] | null }
type ProcRow = { id: string; numero_processo: string; banco: { nome: string } | { nome: string }[] | null }
const um = <T,>(x: T | T[] | null): T | null => (Array.isArray(x) ? x[0] ?? null : x)

const paraDestinoLead = (l: LeadRow, participa: boolean): DestinoVinculo => ({
  entidade_tipo: 'lead', entidade_id: l.id, titulo: `Lead · ${l.nome ?? 'sem nome'}`, subtitulo: um(l.fase)?.nome ?? null, pessoa_participa: participa,
})
const paraDestinoProc = (p: ProcRow, participa: boolean): DestinoVinculo => ({
  entidade_tipo: 'processo', entidade_id: p.id, titulo: p.numero_processo, subtitulo: um(p.banco)?.nome ?? null, pessoa_participa: participa,
})

/**
 * Roda com o cliente do USUÁRIO (RLS): só devolve o que ele já enxerga — a busca livre
 * nunca revela lead/negócio de outra carteira.
 */
export async function buscarDestinos(cliente: SupabaseClient, pessoaId: string, busca: string): Promise<DestinoVinculo[]> {
  const fechados = `(${STATUS_LEAD_FECHADO.join(',')})`
  const bloqueados = `(${STATUS_BLOQUEADOS_PROCESSO.join(',')})`
  const selLead = 'id, nome, fase:fases!fase_id(nome)'
  const selProc = 'id, numero_processo, banco:bancos!banco_id(nome)'

  const [leadsTit, leadsConj, comp, vend] = await Promise.all([
    cliente.from('leads').select(selLead).eq('pessoa_id', pessoaId).is('deleted_at', null).not('status_analise', 'in', fechados),
    cliente.from('leads').select(selLead).eq('conjuge_pessoa_id', pessoaId).is('deleted_at', null).not('status_analise', 'in', fechados),
    cliente.from('processo_compradores').select('processo_id').eq('pessoa_id', pessoaId),
    cliente.from('processo_vendedores').select('processo_id').eq('pessoa_id', pessoaId),
  ])
  const erro = leadsTit.error ?? leadsConj.error ?? comp.error ?? vend.error
  if (erro) throw new Error(`destinos: ${erro.message}`)

  const idsProcDaPessoa = Array.from(new Set([...(comp.data ?? []), ...(vend.data ?? [])].map(r => r.processo_id as string)))
  const procsDaPessoa = idsProcDaPessoa.length
    ? await cliente.from('processos').select(selProc).in('id', idsProcDaPessoa).is('deleted_at', null).not('status_processo', 'in', bloqueados)
    : { data: [] as ProcRow[], error: null }
  if (procsDaPessoa.error) throw new Error(`destinos: ${procsDaPessoa.error.message}`)

  const vistos = new Set<string>()
  const resultado: DestinoVinculo[] = []
  const add = (d: DestinoVinculo) => { if (!vistos.has(d.entidade_id)) { vistos.add(d.entidade_id); resultado.push(d) } }
  for (const l of [...(leadsTit.data ?? []), ...(leadsConj.data ?? [])] as LeadRow[]) add(paraDestinoLead(l, true))
  for (const p of (procsDaPessoa.data ?? []) as ProcRow[]) add(paraDestinoProc(p, true))

  const { numeroProcesso, texto } = interpretarBuscaDestino(busca)
  if (numeroProcesso) {
    const { data, error } = await cliente.from('processos').select(selProc).eq('numero_processo', numeroProcesso).is('deleted_at', null).limit(1)
    if (error) throw new Error(`destinos: ${error.message}`)
    for (const p of (data ?? []) as ProcRow[]) add(paraDestinoProc(p, idsProcDaPessoa.includes(p.id)))
  } else if (texto) {
    const [leadsBusca, pessoasBusca] = await Promise.all([
      cliente.from('leads').select(selLead).ilike('nome', `%${texto}%`).is('deleted_at', null).not('status_analise', 'in', fechados).limit(LIMITE_BUSCA),
      cliente.from('pessoas').select('id').ilike('nome', `%${texto}%`).is('deleted_at', null).limit(LIMITE_BUSCA),
    ])
    if (leadsBusca.error || pessoasBusca.error) throw new Error(`destinos: ${(leadsBusca.error ?? pessoasBusca.error)!.message}`)
    for (const l of (leadsBusca.data ?? []) as LeadRow[]) add(paraDestinoLead(l, false))
    const idsPessoas = (pessoasBusca.data ?? []).map(p => p.id as string)
    if (idsPessoas.length) {
      const { data: compBusca, error: eC } = await cliente.from('processo_compradores').select('processo_id').in('pessoa_id', idsPessoas).limit(LIMITE_BUSCA)
      if (eC) throw new Error(`destinos: ${eC.message}`)
      const ids = Array.from(new Set((compBusca ?? []).map(r => r.processo_id as string)))
      if (ids.length) {
        const { data, error } = await cliente.from('processos').select(selProc).in('id', ids).is('deleted_at', null).not('status_processo', 'in', bloqueados)
        if (error) throw new Error(`destinos: ${error.message}`)
        for (const p of (data ?? []) as ProcRow[]) add(paraDestinoProc(p, idsProcDaPessoa.includes(p.id)))
      }
    }
  }
  return resultado
}
```

Note for the fake DB: `pessoas` rows in the test have no `deleted_at`; `is('deleted_at', null)` treats missing as null (fakeDb `(r[c] ?? null) === v`). The "lead fechado" check uses `not('status_analise','in','(...)')`, supported by fakeDb.

```ts
// src/app/api/documentos/vinculos/destinos/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { autenticarRota, clienteDoUsuario } from '@/lib/documentos/vinculosServidor'
import { buscarDestinos } from '@/lib/documentos/destinosVinculo'

/** Destinos de "Enviar para…": leads/negócios da pessoa + busca livre (RLS do usuário). */
export async function GET(request: NextRequest) {
  const ctx = await autenticarRota(request)
  if (ctx instanceof NextResponse) return ctx
  const pessoaId = request.nextUrl.searchParams.get('pessoa_id') ?? ''
  const busca = request.nextUrl.searchParams.get('busca') ?? ''
  if (!pessoaId) return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 })
  try {
    return NextResponse.json({ destinos: await buscarDestinos(clienteDoUsuario(ctx.token), pessoaId, busca) })
  } catch (err) {
    console.error('[documentos/vinculos/destinos]', err)
    return NextResponse.json({ error: 'Não foi possível carregar os destinos.' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/documentos/__tests__/destinosVinculo.test.ts`
Expected: PASS.

- [ ] **Step 5: Validate the new PostgREST query shapes against the real database (read-only)**

The embeds `fase:fases!fase_id(nome)` / `banco:bancos!banco_id(nome)` and `.not('status_analise','in','(…)')` must be accepted by PostgREST (CLAUDE.md: query errors fail silently). Run a throwaway read-only script in the session scratchpad (NOT in the repo) using `.env.local` and the service role, executing each `select(...)` of `buscarDestinos` once with `pessoa_id` of "joao do oculos" (`select id from pessoas where nome ilike 'joao do oculos'`), and print `error?.message` for each. Expected: every `error` is `undefined`. Fix the select string in `destinosVinculo.ts` if any fails, re-run Step 4.

- [ ] **Step 6: Commit**

```bash
git add src/lib/documentos/destinosVinculo.ts src/app/api/documentos/vinculos/destinos/route.ts src/lib/documentos/__tests__/destinosVinculo.test.ts
git commit -m "feat(documentos): rota de destinos para Enviar para…

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Hook de cliente + "Enviar para…" na tela da Pessoa

**Files:**
- Create: `src/hooks/documentos/useVinculosDocumento.ts`
- Create: `src/components/documentos/EnviarDocumentosModal.tsx`
- Modify: `src/components/documentos/AbaDocumentos.tsx` (estado de seleção, etiquetas, filtro "Só na pessoa", botão "Enviar para…" — só `contexto === 'pessoa'`)

**Interfaces:**
- Consumes: rotas das Tasks 3 e 5; `montarEtiquetasVinculo`, `EtiquetaVinculo`, `MotivoRecusa`, `EntidadeVinculo` (Task 1); `DestinoVinculo` (Task 5, importar como `type`).
- Produces:
  ```ts
  export async function chamarApiVinculos<T>(caminho: string, init?: { method?: 'GET' | 'POST' | 'DELETE'; body?: unknown }): Promise<T>  // lança Error(mensagem da API)
  export function useEnviarDocumentos(): UseMutationResult<{ vinculados: number; ja_existiam: number; recusados: { documento_id: string; motivo: MotivoRecusa }[] }, Error, { documento_ids: string[]; entidade_tipo: EntidadeVinculo; entidade_id: string }>
  export function useRemoverVinculo(): UseMutationResult<{ ok: true }, Error, { documento_id: string; entidade_tipo: EntidadeVinculo; entidade_id: string }>
  export function useDestinosPessoa(pessoaId: string | undefined, busca: string, habilitado: boolean): UseQueryResult<DestinoVinculo[]>
  export function useCandidatosTrazer(entidadeTipo: EntidadeVinculo, entidadeId: string | undefined, habilitado: boolean): UseQueryResult<{ pessoa_id: string; nome: string; documentos: { id: string; nome: string; classificacao: string | null; recebido_em: string }[] }[]>
  export function useEtiquetasVinculo(documentoIds: string[], habilitado: boolean): UseQueryResult<Map<string, EtiquetaVinculo[]>>
  // EnviarDocumentosModal props
  { aberto: boolean; onFechar: () => void; pessoaId: string; documentoIds: string[]; onEnviado: () => void }
  ```

- [ ] **Step 1: Write the hook**

```ts
// src/hooks/documentos/useVinculosDocumento.ts
'use client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { montarEtiquetasVinculo, type EntidadeVinculo, type MotivoRecusa } from '@/lib/documentos/vinculos'
import type { DestinoVinculo } from '@/lib/documentos/destinosVinculo'

export async function chamarApiVinculos<T>(caminho: string, init: { method?: 'GET' | 'POST' | 'DELETE'; body?: unknown } = {}): Promise<T> {
  const { data: sessao } = await supabase.auth.getSession()
  const res = await fetch(`/api/documentos/vinculos${caminho}`, {
    method: init.method ?? 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessao.session?.access_token ?? ''}` },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
  const json = await res.json().catch(() => null) as (T & { error?: string }) | null
  if (!res.ok) throw new Error(json?.error ?? 'Não foi possível concluir. Tente de novo.')
  return json as T
}

// Qualquer lista de documentos (Pessoa/Lead/Negócio) e as etiquetas precisam recarregar.
function invalidarDocumentos(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['documentos-unificado'] })
  qc.invalidateQueries({ queryKey: ['documentos-etiquetas'] })
  qc.invalidateQueries({ queryKey: ['documentos-candidatos'] })
}

export function useEnviarDocumentos() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { documento_ids: string[]; entidade_tipo: EntidadeVinculo; entidade_id: string }) =>
      chamarApiVinculos<{ vinculados: number; ja_existiam: number; recusados: { documento_id: string; motivo: MotivoRecusa }[] }>('', { method: 'POST', body }),
    onSuccess: () => invalidarDocumentos(qc),
  })
}

export function useRemoverVinculo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { documento_id: string; entidade_tipo: EntidadeVinculo; entidade_id: string }) =>
      chamarApiVinculos<{ ok: true }>('', { method: 'DELETE', body }),
    onSuccess: () => invalidarDocumentos(qc),
  })
}

export function useDestinosPessoa(pessoaId: string | undefined, busca: string, habilitado: boolean) {
  return useQuery({
    queryKey: ['documentos-destinos', pessoaId, busca],
    enabled: habilitado && !!pessoaId,
    queryFn: async () => (await chamarApiVinculos<{ destinos: DestinoVinculo[] }>(
      `/destinos?pessoa_id=${encodeURIComponent(pessoaId!)}&busca=${encodeURIComponent(busca)}`,
    )).destinos,
  })
}

export function useCandidatosTrazer(entidadeTipo: EntidadeVinculo, entidadeId: string | undefined, habilitado: boolean) {
  return useQuery({
    queryKey: ['documentos-candidatos', entidadeTipo, entidadeId],
    enabled: habilitado && !!entidadeId,
    queryFn: async () => (await chamarApiVinculos<{ pessoas: { pessoa_id: string; nome: string; documentos: { id: string; nome: string; classificacao: string | null; recebido_em: string }[] }[] }>(
      `/candidatos?entidade_tipo=${entidadeTipo}&entidade_id=${encodeURIComponent(entidadeId!)}`,
    )).pessoas,
  })
}

/** Onde cada documento está (tela da Pessoa). Leads fora da carteira aparecem só como "Lead". */
export function useEtiquetasVinculo(documentoIds: string[], habilitado: boolean) {
  return useQuery({
    queryKey: ['documentos-etiquetas', [...documentoIds].sort().join(',')],
    enabled: habilitado && documentoIds.length > 0,
    queryFn: async () => {
      const { data: vinculos, error } = await supabase.from('documento_vinculos')
        .select('documento_id, entidade_tipo, entidade_id').in('documento_id', documentoIds).in('entidade_tipo', ['lead', 'processo'])
      if (error) throw error
      const idsLead = Array.from(new Set((vinculos ?? []).filter(v => v.entidade_tipo === 'lead').map(v => v.entidade_id as string)))
      const idsProc = Array.from(new Set((vinculos ?? []).filter(v => v.entidade_tipo === 'processo').map(v => v.entidade_id as string)))
      const [leads, procs] = await Promise.all([
        idsLead.length ? supabase.from('leads').select('id, fase:fases!fase_id(nome)').in('id', idsLead) : Promise.resolve({ data: [], error: null }),
        idsProc.length ? supabase.from('processos').select('id, numero_processo').in('id', idsProc) : Promise.resolve({ data: [], error: null }),
      ])
      if (leads.error) throw leads.error
      if (procs.error) throw procs.error
      const faseDe = (f: unknown) => (Array.isArray(f) ? f[0]?.nome : (f as { nome?: string } | null)?.nome) ?? null
      return montarEtiquetasVinculo(
        (vinculos ?? []) as { documento_id: string; entidade_tipo: string; entidade_id: string }[],
        new Map((leads.data ?? []).map((l: { id: string; fase: unknown }) => [l.id, faseDe(l.fase)])),
        new Map((procs.data ?? []).map((p: { id: string; numero_processo: string }) => [p.id, p.numero_processo])),
      )
    },
  })
}
```

- [ ] **Step 2: Write `EnviarDocumentosModal`**

```tsx
// src/components/documentos/EnviarDocumentosModal.tsx
'use client'
import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useDestinosPessoa, useEnviarDocumentos } from '@/hooks/documentos/useVinculosDocumento'
import type { DestinoVinculo } from '@/lib/documentos/destinosVinculo'

const MOTIVOS: Record<string, string> = {
  documento_de_trabalho: 'é documento de trabalho de um negócio',
  excluido: 'foi excluído',
  outra_empresa: 'não é desta empresa',
  nao_encontrado: 'não foi encontrado',
}

interface Props { aberto: boolean; onFechar: () => void; pessoaId: string; documentoIds: string[]; onEnviado: () => void }

export function EnviarDocumentosModal({ aberto, onFechar, pessoaId, documentoIds, onEnviado }: Props) {
  const [busca, setBusca] = useState('')
  const [escolhido, setEscolhido] = useState<DestinoVinculo | null>(null)
  const { data: destinos = [], isLoading } = useDestinosPessoa(pessoaId, busca, aberto)
  const enviar = useEnviarDocumentos()
  const daPessoa = destinos.filter(d => d.pessoa_participa)
  const outros = destinos.filter(d => !d.pessoa_participa)

  function fechar() { setBusca(''); setEscolhido(null); onFechar() }

  async function confirmar() {
    if (!escolhido) return
    try {
      const r = await enviar.mutateAsync({ documento_ids: documentoIds, entidade_tipo: escolhido.entidade_tipo, entidade_id: escolhido.entidade_id })
      const partes = [`${r.vinculados} documento${r.vinculados !== 1 ? 's' : ''} enviado${r.vinculados !== 1 ? 's' : ''} para ${escolhido.titulo}`]
      if (r.ja_existiam > 0) partes.push(`${r.ja_existiam} já estava${r.ja_existiam !== 1 ? 'm' : ''} lá`)
      toast.success(partes.join(' · '))
      for (const rec of r.recusados) toast.warning(`Um documento não foi enviado: ${MOTIVOS[rec.motivo] ?? rec.motivo}.`)
      onEnviado()
      fechar()
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const Item = ({ d }: { d: DestinoVinculo }) => (
    <button
      type="button"
      onClick={() => setEscolhido(d)}
      className={cn('flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors',
        escolhido?.entidade_id === d.entidade_id ? 'border-fonti-primary bg-fonti-primary/5' : 'border-gray-100 hover:bg-gray-50')}
    >
      <span className="font-medium text-gray-800">{d.titulo}</span>
      {d.subtitulo && <span className="text-xs text-gray-400">{d.subtitulo}</span>}
    </button>
  )

  return (
    <Dialog open={aberto} onOpenChange={(v) => { if (!v) fechar() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Enviar {documentoIds.length} documento{documentoIds.length !== 1 ? 's' : ''} para…</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs font-medium text-gray-500">Leads e negócios desta pessoa</p>
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
            : daPessoa.length === 0 ? <p className="text-xs text-gray-400">Esta pessoa não tem lead aberto nem negócio.</p>
            : <div className="space-y-1.5">{daPessoa.map(d => <Item key={d.entidade_id} d={d} />)}</div>}
          <p className="pt-2 text-xs font-medium text-gray-500">Outro lead/negócio</p>
          <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Nome do cliente ou número (ex.: 57)" className="h-9 text-sm" />
          {outros.length > 0 && <div className="space-y-1.5">{outros.map(d => <Item key={d.entidade_id} d={d} />)}</div>}
          {escolhido && !escolhido.pessoa_participa && (
            <p className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5" />
              Esta pessoa não participa deste {escolhido.entidade_tipo === 'lead' ? 'lead' : 'negócio'}.
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={fechar}>Cancelar</Button>
            <Button size="sm" disabled={!escolhido || enviar.isPending} onClick={confirmar} className="bg-fonti-primary text-white hover:bg-fonti-primary-hover">
              {enviar.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
              Enviar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

Before writing, confirm `@/components/ui/input` and `DialogHeader`/`DialogTitle` exist (`ls src/components/ui/`, `grep -n "export" src/components/ui/dialog.tsx`); if `Input` is missing use a plain `<input className="h-9 w-full rounded-md border px-3 text-sm" />`.

- [ ] **Step 3: Wire into `AbaDocumentos.tsx` (contexto pessoa)**

Edits (all guarded by `contexto === 'pessoa'`):

1. Imports: add `Send` to the lucide import list, and
   ```ts
   import { EnviarDocumentosModal } from '@/components/documentos/EnviarDocumentosModal'
   import { useEtiquetasVinculo } from '@/hooks/documentos/useVinculosDocumento'
   ```
2. State, next to `organizarAberto`:
   ```ts
   const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
   const [enviarAberto, setEnviarAberto] = useState(false)
   const [soNaPessoa, setSoNaPessoa] = useState(false)
   ```
3. After the `documentos` query:
   ```ts
   const { data: etiquetas } = useEtiquetasVinculo(documentos.map(d => d.id), contexto === 'pessoa')
   ```
4. Replace the `documentosExibidos` memo's first line so the pessoa filter applies:
   ```ts
   const documentosExibidos = useMemo(() => {
     if (contexto === 'pessoa') return soNaPessoa ? documentos.filter(d => !(etiquetas?.get(d.id)?.length)) : documentos
     if (!usaPastas || !pastaAtiva) return documentos
     if (pastaAtiva === 'todos') return documentos
     if (pastaAtiva === 'sem_pasta') return documentos.filter(d => !d.pasta_id)
     return documentos.filter(d => d.pasta_id === (pastaAtivaInfo?.id ?? '__nunca__'))
   }, [contexto, soNaPessoa, etiquetas, usaPastas, pastaAtiva, pastaAtivaInfo, documentos])
   ```
5. Toolbar: right after the header `<div className="flex flex-col gap-2 sm:flex-row …">…</div>` block (the one with "Adicionar Documento"), insert:
   ```tsx
   {contexto === 'pessoa' && documentos.length > 0 && (
     <div className="flex flex-wrap items-center gap-2">
       <button
         onClick={() => setSoNaPessoa(v => !v)}
         className={cn('rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors',
           soNaPessoa ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50')}
       >
         Só na pessoa
       </button>
       <Button
         size="sm" variant="outline" className="h-7 gap-1 text-xs"
         disabled={selecionados.size === 0}
         onClick={() => setEnviarAberto(true)}
       >
         <Send className="h-3 w-3" />
         Enviar para…{selecionados.size > 0 ? ` (${selecionados.size})` : ''}
       </Button>
     </div>
   )}
   ```
6. In each document row, as the first child of the row's inner `<div className="flex min-w-0 gap-3 …">` (before the mime icon span):
   ```tsx
   {contexto === 'pessoa' && (
     <input
       type="checkbox"
       aria-label="Selecionar documento"
       className="mt-1 h-4 w-4 shrink-0 accent-fonti-primary sm:mt-0"
       checked={selecionados.has(doc.id)}
       onChange={() => setSelecionados(prev => { const n = new Set(prev); if (n.has(doc.id)) n.delete(doc.id); else n.add(doc.id); return n })}
     />
   )}
   ```
7. In the row's badges area, right before `{doc.vinculado && (…Compartilhado…)}`:
   ```tsx
   {contexto === 'pessoa' && (() => {
     const lista = etiquetas?.get(doc.id) ?? []
     return lista.length === 0
       ? <span className="px-2 py-1 rounded-lg text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">Só na pessoa</span>
       : lista.map(e => (
           <span key={`${e.tipo}-${e.entidade_id}`} className="px-2 py-1 rounded-lg text-xs font-medium bg-blue-50 text-blue-600 border border-blue-200">{e.texto}</span>
         ))
   })()}
   ```
   and change the existing `{doc.vinculado && (` to `{doc.vinculado && contexto !== 'pessoa' && (` (the etiquetas replace "Compartilhado" on the Pessoa screen).
8. Next to the other modals at the end of the component (e.g. after `<OrganizarArquivosModal …/>`), add:
   ```tsx
   {contexto === 'pessoa' && pessoaId && (
     <EnviarDocumentosModal
       aberto={enviarAberto}
       onFechar={() => setEnviarAberto(false)}
       pessoaId={pessoaId}
       documentoIds={Array.from(selecionados)}
       onEnviado={() => setSelecionados(new Set())}
     />
   )}
   ```

- [ ] **Step 4: Typecheck and run tests**

Run: `npx tsc --noEmit -p .` → Expected: no output.
Run: `npx vitest run src/lib/documentos src/app/api/documentos` → Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/documentos/useVinculosDocumento.ts src/components/documentos/EnviarDocumentosModal.tsx src/components/documentos/AbaDocumentos.tsx
git commit -m "feat(documentos): Enviar para… e etiquetas de vínculo na tela da Pessoa

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: "Trazer das pessoas" e "Remover" no Lead/Negócio

**Files:**
- Create: `src/components/documentos/TrazerDocumentosModal.tsx`
- Modify: `src/components/documentos/AbaDocumentos.tsx`

**Interfaces:**
- Consumes: `useCandidatosTrazer`, `useEnviarDocumentos`, `useRemoverVinculo` (Task 6); `EntidadeVinculo` (Task 1).
- Produces: `TrazerDocumentosModal` props `{ aberto: boolean; onFechar: () => void; entidadeTipo: EntidadeVinculo; entidadeId: string }`.
- `DocumentoCliente` ganha `vinculo_direto?: boolean` (true quando o documento tem vínculo com ESTE lead/processo — só esses mostram "Remover").

- [ ] **Step 1: Write `TrazerDocumentosModal`**

```tsx
// src/components/documentos/TrazerDocumentosModal.tsx
'use client'
import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { useCandidatosTrazer, useEnviarDocumentos } from '@/hooks/documentos/useVinculosDocumento'
import type { EntidadeVinculo } from '@/lib/documentos/vinculos'

interface Props { aberto: boolean; onFechar: () => void; entidadeTipo: EntidadeVinculo; entidadeId: string }

export function TrazerDocumentosModal({ aberto, onFechar, entidadeTipo, entidadeId }: Props) {
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const { data: pessoas = [], isLoading, error } = useCandidatosTrazer(entidadeTipo, entidadeId, aberto)
  const enviar = useEnviarDocumentos()

  function fechar() { setMarcados(new Set()); onFechar() }
  function alternar(id: string) {
    setMarcados(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }

  async function trazer() {
    try {
      const r = await enviar.mutateAsync({ documento_ids: Array.from(marcados), entidade_tipo: entidadeTipo, entidade_id: entidadeId })
      toast.success(`${r.vinculados} documento${r.vinculados !== 1 ? 's' : ''} trazido${r.vinculados !== 1 ? 's' : ''}`)
      if (r.recusados.length > 0) toast.warning(`${r.recusados.length} documento(s) não puderam ser trazidos.`)
      fechar()
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => { if (!v) fechar() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Trazer documentos das pessoas</DialogTitle></DialogHeader>
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
          : error ? <p className="text-sm text-red-600">{(error as Error).message}</p>
          : pessoas.length === 0 ? <p className="text-sm text-gray-500">Nenhum documento das pessoas fora daqui.</p>
          : (
            <div className="max-h-[60vh] space-y-4 overflow-y-auto">
              {pessoas.map(p => (
                <div key={p.pessoa_id} className="space-y-1.5">
                  <p className="text-xs font-semibold text-gray-600">{p.nome}</p>
                  {p.documentos.map(d => (
                    <label key={d.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-100 px-3 py-2 text-sm hover:bg-gray-50">
                      <input type="checkbox" className="h-4 w-4 accent-fonti-primary" checked={marcados.has(d.id)} onChange={() => alternar(d.id)} />
                      <span className="min-w-0 flex-1 truncate">{d.nome}</span>
                      <span className="shrink-0 text-xs text-gray-400">{format(new Date(d.recebido_em), 'dd/MM/yyyy')}</span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={fechar}>Cancelar</Button>
          <Button size="sm" disabled={marcados.size === 0 || enviar.isPending} onClick={trazer} className="bg-fonti-primary text-white hover:bg-fonti-primary-hover">
            {enviar.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
            Trazer{marcados.size > 0 ? ` (${marcados.size})` : ''}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Wire into `AbaDocumentos.tsx` (contexto lead/processo)**

1. Imports: add `Users, Unlink` to the lucide list; add
   ```ts
   import { TrazerDocumentosModal } from '@/components/documentos/TrazerDocumentosModal'
   import { useRemoverVinculo } from '@/hooks/documentos/useVinculosDocumento'
   ```
   (merge with the Task 6 import of `useEtiquetasVinculo` into one import line).
2. `interface DocumentoCliente`: add `vinculo_direto?: boolean`.
3. In the query `.map(d => ({ …d, …` add:
   ```ts
   vinculo_direto: contexto !== 'pessoa' && pastaPorVinculo.has(d.id) && d.dominio !== 'processo_trabalho',
   ```
   (`pastaPorVinculo` is filled only from `vinculosDiretos` = links with this lead/processo; documents shown virtually in the lead's "Sem pasta" are not in it).
4. State: `const [trazerAberto, setTrazerAberto] = useState(false)` and `const [confirmandoRemocao, setConfirmandoRemocao] = useState<string | null>(null)`; hook: `const removerVinculo = useRemoverVinculo()`.
5. Handler (next to `handleExcluir`):
   ```ts
   async function handleRemoverVinculo(doc: DocumentoCliente) {
     if (contexto === 'pessoa' || !entidadeId) return
     if (confirmandoRemocao !== doc.id) {
       setConfirmandoRemocao(doc.id)
       toast.info('O documento continua na pessoa. Clique de novo para remover daqui.')
       setTimeout(() => setConfirmandoRemocao(c => (c === doc.id ? null : c)), 4000)
       return
     }
     setConfirmandoRemocao(null)
     try {
       await removerVinculo.mutateAsync({ documento_id: doc.id, entidade_tipo: contexto, entidade_id: entidadeId })
       toast.success(`Removido deste ${contexto === 'lead' ? 'lead' : 'negócio'}. O documento continua na pessoa.`)
     } catch (err) {
       toast.error((err as Error).message)
     }
   }
   ```
6. Header: inside the header `div` that holds "Adicionar Documento", wrap the button in `<div className="flex gap-2">` and add before it:
   ```tsx
   {contexto !== 'pessoa' && (
     <Button size="sm" variant="outline" className="h-8 w-full gap-1.5 text-xs sm:w-auto" onClick={() => setTrazerAberto(true)}>
       <Users className="h-3 w-3" />
       Trazer das pessoas
     </Button>
   )}
   ```
7. Row actions: right before the "Excluir" `<button onClick={() => handleExcluir(doc.id)} …>`:
   ```tsx
   {doc.vinculo_direto && (
     <button
       onClick={() => handleRemoverVinculo(doc)}
       title={confirmandoRemocao === doc.id ? 'Clique novamente para remover daqui' : `Remover deste ${contexto === 'lead' ? 'lead' : 'negócio'} (continua na pessoa)`}
       disabled={removerVinculo.isPending}
       className={cn('p-1.5 rounded-lg transition-colors',
         confirmandoRemocao === doc.id ? 'bg-amber-500 text-white' : 'text-gray-400 hover:text-amber-600 hover:bg-amber-50')}
     >
       <Unlink className="h-3.5 w-3.5" />
     </button>
   )}
   ```
8. Modal, next to the Task 6 modal:
   ```tsx
   {contexto !== 'pessoa' && entidadeId && (
     <TrazerDocumentosModal aberto={trazerAberto} onFechar={() => setTrazerAberto(false)} entidadeTipo={contexto} entidadeId={entidadeId} />
   )}
   ```

- [ ] **Step 3: Typecheck and run tests**

Run: `npx tsc --noEmit -p .` → Expected: no output.
Run: `npx vitest run src/lib/documentos src/app/api/documentos` → Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/documentos/TrazerDocumentosModal.tsx src/components/documentos/AbaDocumentos.tsx
git commit -m "feat(documentos): Trazer das pessoas e Remover deste lead/negócio

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Conversão lead → negócio grava pela rota

**Files:**
- Modify: `src/components/leads/NovoProcessoModal.tsx` (`handleVincular`, ~linhas 1776-1815)

**Interfaces:**
- Consumes: `chamarApiVinculos` (Task 6), `POST /api/documentos/vinculos` (Task 3).

- [ ] **Step 1: Replace the body of `handleVincular`**

Keep the signature and the `ids.size === 0` early return. Replace from `setVinculando(true)` through the `upsert`/error block with:

```ts
    setVinculando(true)
    // Grava pela rota de servidor (mesma regra de pasta — pasta do lead > papel no
    // processo > tipo — e mesmas checagens do "Trazer das pessoas").
    try {
      const r = await chamarApiVinculos<{ vinculados: number; ja_existiam: number; recusados: unknown[] }>('', {
        method: 'POST',
        body: { documento_ids: Array.from(ids), entidade_tipo: 'processo', entidade_id: processoId },
      })
      if (r.recusados.length > 0) toast.warning(`${r.recusados.length} documento(s) não puderam ser vinculados.`)
    } catch (err) {
      setVinculando(false)
      console.error('[VincularStep] erro ao vincular documentos:', err)
      toast.error(`Erro ao vincular documentos: ${(err as Error).message}`)
      return
    }
    setVinculando(false)
```

Keep whatever the function did after the old error block (success toast / `onConcluir(processoId)` etc.) unchanged. Add `import { chamarApiVinculos } from '@/hooks/documentos/useVinculosDocumento'`. Remove imports/variables that become unused (`inferirPastaSugerida`, `catalogoTipos`, `catalogoPastas`, `compradorasIds`/`vendedorasIds`, `usuario`, `empresaId` inside `VincularStep`) **only if** tsc/eslint reports them unused — they may be used elsewhere in the file.

- [ ] **Step 2: Typecheck and run tests**

Run: `npx tsc --noEmit -p .` → Expected: no output.
Run: `npx vitest run --exclude ".claude/**" --exclude "output/**"` → Expected: only the pre-existing failures listed in Global Constraints.

- [ ] **Step 3: Commit**

```bash
git add src/components/leads/NovoProcessoModal.tsx
git commit -m "refactor(negocios): conversão lead → negócio vincula documentos pela rota

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Dica no bot, documentação, validação real e PR

**Files:**
- Modify: `src/lib/bot/fonti-comandos.ts:698`
- Modify: `src/lib/bot/__tests__/resposta-salva-pessoa.test.ts:34`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the bot test first**

In `resposta-salva-pessoa.test.ts`, the assertion at line 34 becomes:
```ts
    expect(r).toContain('📎 Sem lead aberto — ficou só na pessoa')
    expect(r).toContain('Pessoas →')
    expect(r).toContain('Enviar para…')
```
Run: `npx vitest run src/lib/bot/__tests__/resposta-salva-pessoa.test.ts` → Expected: FAIL (no "Pessoas →").

- [ ] **Step 2: Update the message**

In `montarRespostaSalvaPessoa` (`fonti-comandos.ts` ~line 698), replace `'📎 Sem lead aberto — ficou só na pessoa'` with:
```ts
`📎 Sem lead aberto — ficou só na pessoa\nPara mandar a um lead/negócio: Pessoas → ${args.nome} → Documentos → Enviar para…`
```
(use the function's actual args variable name for the person name — read the function signature first; it receives `nome`). Run the test → PASS.

- [ ] **Step 3: Document the rule in CLAUDE.md**

Append a section after "## Pastas de documentos na Captação (2026-09-24)":

```markdown
## Documento da Pessoa → Lead/Negócio: sempre pelas rotas `/api/documentos/vinculos` (2026-09-25)

Vincular documento existente a um lead/negócio (tela da Pessoa "Enviar para…", "Trazer das pessoas",
conversão lead → negócio) passa por `POST /api/documentos/vinculos`; remover por `DELETE` (só tira o
vínculo, registra em `lead_historico`/`processo_comentarios`). Regras em `src/lib/documentos/vinculos.ts`.
- Nunca muda `documentos.pessoa_id`; `upsert` com `ignoreDuplicates` (não sobrescreve a pasta de um
  vínculo que já existia). Só `acervo_documental`.
- Permissão: `leads.editar`/`processos.editar` (`podeServidor`) **e** destino visível com o JWT do
  usuário (`clienteDoUsuario`) — a RLS de carteira decide; a busca de destinos também roda com esse
  cliente, então nunca revela lead/negócio de outra carteira.
- Não gravar vínculo direto do cliente (`supabase.from('documento_vinculos').upsert` num componente) —
  foi assim que a conversão lead → negócio tinha a regra de pasta copiada.
```

- [ ] **Step 4: Validate against the real database, then clean up**

Throwaway script in the session scratchpad (never committed), service role from `.env.local`:
1. Find "joao do oculos": `pessoas` `ilike('nome','joao do oculos')`, its acervo docs (the 2 from 2026-09-25: `Print.docx`, `Holerite Vitoria- junho.jpg`), and `#proc-057` id.
2. Run the exact `documento_vinculos` upsert shape of Task 3 (`onConflict: 'documento_id,entidade_tipo,entidade_id', ignoreDuplicates: true` + `.select('documento_id')`) for those 2 docs → `#proc-057`; print returned rows (expect 2), re-run (expect 0 = ignoreDuplicates works on the real index).
3. Run the Task 3 DELETE shape with `.select('id')` for both (expect 1 row each), and confirm `documentos.pessoa_id` unchanged and no `documento_vinculos` rows left for those 2 docs with `entidade_id = #proc-057`.
4. Run each Task 4 select once (candidates for `#proc-057`) and print `error?.message` (expect `undefined`).
Record results in the PR description. Do not insert any `lead_historico`/`processo_comentarios` row in this script.

- [ ] **Step 5: Full verification**

Run: `npx tsc --noEmit -p .` → no output.
Run: `npx vitest run --exclude ".claude/**" --exclude "output/**"` → only pre-existing failures.
Run: `git checkout -- src/lib/simuladorFinanciamento/__tests__/__snapshots__/` and `git status --short` → only intended files.

- [ ] **Step 6: Commit, push, PR, merge**

```bash
git add src/lib/bot/fonti-comandos.ts src/lib/bot/__tests__/resposta-salva-pessoa.test.ts CLAUDE.md
git commit -m "docs+bot: dica de Enviar para… no *salva sem lead e regra no CLAUDE.md

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push -u origin feat/documentos-pessoa-vinculo
gh pr create --base main --title "feat(documentos): enviar/trazer/remover documentos entre Pessoa e Lead/Negócio" --body "<resumo + validação real do Step 4 + 🤖 Generated with [Claude Code](https://claude.com/claude-code)>"
gh pr merge --squash
```

Then sync local `main` (`git pull --ff-only` in the main checkout), remove the worktree (unlink the `node_modules` junction first with `cmd /c rmdir`), and tell the user what to test in production: Pessoa "joao do oculos" → Só na pessoa → marcar os 2 → Enviar para… → um negócio; no negócio, Remover; num negócio com comprador, Trazer das pessoas; repetir com um usuário comercial.
