/**
 * Incidente real (2026-09-25 12:36): certidão.jpg + "*salva joao" com ~0,5s de diferença.
 * O *salva achou 8 "joao" e foi guardar a lista (fonti_marcas.candidatos_pendentes): o UPDATE
 * não achou linha, o PDF abriu a sessão nesse instante (garantirSessaoMidiaOperador) e o
 * INSERT do *salva bateu na unicidade (empresa_id, telefone_conversa) — a lista sumiu em
 * silêncio. A resposta "3" não achou candidatos e ninguém respondeu.
 */
import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { criarFakeDb, type Row } from '@/lib/documentos/__tests__/helpers/fakeDb'

vi.mock('@/lib/pessoa', () => ({ buscarOuCriarPessoa: vi.fn() }))
vi.mock('@/lib/workflows/workflow-captacao', () => ({ executarWorkflowCaptacao: vi.fn() }))

const UNICOS = { fonti_marcas: ['empresa_id', 'telefone_conversa'] }
const candidatos = [{ id: 'p1', nome: 'joao' }, { id: 'p3', nome: 'Joao plenario dos santos' }]

/** Roda `concorrente` logo depois da N-ésima chamada de `metodo` em fonti_marcas terminar. */
function dbComCorrida(tabelas: Record<string, Row[]>, metodo: 'update' | 'upsert', n: number, concorrente: () => void) {
  const base = criarFakeDb(tabelas, { unicos: UNICOS })
  let chamadas = 0
  return {
    from(t: string) {
      const b = base.from(t) as Record<string, (...a: unknown[]) => unknown>
      if (t !== 'fonti_marcas') return b
      const original = b[metodo]
      b[metodo] = (...args: unknown[]) => {
        chamadas++
        if (metodo === 'upsert' && chamadas === n) concorrente() // antes do upsert: a outra requisição chegou primeiro
        const r = original(...args) as Record<string, unknown>
        if (metodo === 'update' && chamadas === n) {
          const thenOriginal = r.then as (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise<unknown>
          r.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => thenOriginal((v) => { concorrente(); return res(v) }, rej)
        }
        return r
      }
      return b
    },
  } as unknown as SupabaseClient
}

describe('gravarCandidatosPendentes', () => {
  it('sem marca: cria marca só de ambiguidade com os candidatos', async () => {
    const { gravarCandidatosPendentes } = await import('../fonti-comandos')
    const t: Record<string, Row[]> = { fonti_marcas: [] }
    expect(await gravarCandidatosPendentes(criarFakeDb(t, { unicos: UNICOS }) as never, 'e1', '5544', candidatos)).toBe(true)
    expect(t.fonti_marcas[0]).toMatchObject({ sessao_real: false, candidatos_pendentes: candidatos })
  })

  it('PDF abre a sessão entre o UPDATE e o INSERT: candidatos vão pra sessão, que continua real', async () => {
    const { gravarCandidatosPendentes } = await import('../fonti-comandos')
    const t: Record<string, Row[]> = { fonti_marcas: [] }
    const db = dbComCorrida(t, 'update', 1, () => {
      t.fonti_marcas.push({ empresa_id: 'e1', telefone_conversa: '5544', iniciado_at: 'agora', sessao_real: true, pessoa_id: 'sessao', candidatos_pendentes: null })
    })
    expect(await gravarCandidatosPendentes(db, 'e1', '5544', candidatos)).toBe(true)
    expect(t.fonti_marcas).toHaveLength(1)
    expect(t.fonti_marcas[0]).toMatchObject({ sessao_real: true, pessoa_id: 'sessao', candidatos_pendentes: candidatos })
  })
})

describe('garantirSessaoMidiaOperador — corrida com *salva ambíguo', () => {
  it('*salva cria a marca de ambiguidade antes do upsert do PDF: vira sessão real e mantém os candidatos', async () => {
    const { garantirSessaoMidiaOperador } = await import('../fonti-comandos')
    const t: Record<string, Row[]> = { fonti_marcas: [], documentos: [] }
    const db = dbComCorrida(t, 'upsert', 1, () => {
      t.fonti_marcas.push({ empresa_id: 'e1', telefone_conversa: '5544', iniciado_at: 'antes', sessao_real: false, pessoa_id: null, candidatos_pendentes: candidatos })
    })
    await garantirSessaoMidiaOperador(db, 'e1', '5544')
    expect(t.fonti_marcas).toHaveLength(1)
    expect(t.fonti_marcas[0]).toMatchObject({ sessao_real: true, candidatos_pendentes: candidatos })
  })
})
