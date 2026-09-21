/**
 * `*fonti salva [nome]` só vinculava documentos quando a pessoa-alvo tinha lead aberto: sem
 * lead a função devolvia 0 e nem trocava o dono do documento (achado real, 2026-09-21 — só o
 * cliente em etapa Lead recebia os documentos). Documento pertence à Pessoa; o vínculo com
 * lead/processo é opcional.
 */
import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('@/lib/pessoa', () => ({ buscarOuCriarPessoa: vi.fn() }))
vi.mock('@/lib/workflows/workflow-captacao', () => ({ executarWorkflowCaptacao: vi.fn() }))

type Row = Record<string, unknown>

// Banco falso mínimo: encadeia filtros (eq/in/is/gte) e resolve como thenable.
function criarDb(tabelas: Record<string, Row[]>) {
  const from = (tabela: string) => {
    const filtros: Array<(r: Row) => boolean> = []
    let op: 'select' | 'update' | 'insert' = 'select'
    let patch: Row = {}
    let inseridos: Row[] = []
    const linhas = () => (tabelas[tabela] ??= [])
    const aplicar = () => {
      const alvo = linhas().filter((r) => filtros.every((f) => f(r)))
      if (op === 'update') alvo.forEach((r) => Object.assign(r, patch))
      if (op === 'insert') linhas().push(...inseridos)
      return { data: op === 'insert' ? null : alvo, error: null }
    }
    const b: Record<string, unknown> = {
      select: () => b,
      update: (p: Row) => { op = 'update'; patch = p; return b },
      insert: (r: Row | Row[]) => { op = 'insert'; inseridos = Array.isArray(r) ? r : [r]; return b },
      eq: (c: string, v: unknown) => { filtros.push((r) => r[c] === v); return b },
      in: (c: string, vs: unknown[]) => { filtros.push((r) => vs.includes(r[c])); return b },
      is: (c: string, v: unknown) => { filtros.push((r) => (r[c] ?? null) === v); return b },
      gte: (c: string, v: string) => { filtros.push((r) => String(r[c]) >= v); return b },
      limit: () => b,
      maybeSingle: () => Promise.resolve({ data: aplicar().data?.[0] ?? null, error: null }),
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(aplicar()).then(res, rej),
    }
    return b
  }
  return { from } as unknown as SupabaseClient
}

const AGORA = new Date().toISOString()
const cenario = () => {
  const tabelas: Record<string, Row[]> = {
    conversas: [{ empresa_id: 'e1', canal: 'whatsapp', contato_telefone: '5544', pessoa_id: 'provisoria' }],
    documentos: [
      { id: 'd1', empresa_id: 'e1', dominio: 'acervo_documental', pessoa_id: 'provisoria', deleted_at: null, recebido_em: AGORA },
      { id: 'd2', empresa_id: 'e1', dominio: 'acervo_documental', pessoa_id: 'provisoria', deleted_at: null, recebido_em: AGORA },
    ],
    documento_vinculos: [] as Row[],
  }
  return tabelas
}

describe('vincularDocumentosRecentesPorTelefone — pessoa sem lead', () => {
  it('passa o documento para a pessoa-alvo mesmo sem lead, sem criar vínculo', async () => {
    const { vincularDocumentosRecentesPorTelefone } = await import('../fonti-comandos')
    const t = cenario()
    const r = await vincularDocumentosRecentesPorTelefone(criarDb(t), 'e1', '5544', 'alvo', null, 15)

    expect(r.count).toBe(2)
    expect(t.documentos.map((d) => d.pessoa_id)).toEqual(['alvo', 'alvo'])
    expect(t.documento_vinculos).toHaveLength(0)
  })

  it('segunda rodada (retry do *salva) não conta de novo os mesmos documentos', async () => {
    const { vincularDocumentosRecentesPorTelefone } = await import('../fonti-comandos')
    const db = criarDb(cenario())
    await vincularDocumentosRecentesPorTelefone(db, 'e1', '5544', 'alvo', null, 15)
    const r2 = await vincularDocumentosRecentesPorTelefone(db, 'e1', '5544', 'alvo', null, 15)
    expect(r2.count).toBe(0)
  })

  it('sem lead, não mexe em documento que já está vinculado a um negócio', async () => {
    const { vincularDocumentosRecentesPorTelefone } = await import('../fonti-comandos')
    const t = cenario()
    t.documento_vinculos.push({ documento_id: 'd1', entidade_tipo: 'processo', entidade_id: 'p1' })
    const r = await vincularDocumentosRecentesPorTelefone(criarDb(t), 'e1', '5544', 'alvo', null, 15)

    expect(r.count).toBe(1)
    expect(t.documentos.find((d) => d.id === 'd1')?.pessoa_id).toBe('provisoria')
    expect(t.documentos.find((d) => d.id === 'd2')?.pessoa_id).toBe('alvo')
  })

  it('com lead, continua criando o vínculo e trocando o dono', async () => {
    const { vincularDocumentosRecentesPorTelefone } = await import('../fonti-comandos')
    const t = cenario()
    const r = await vincularDocumentosRecentesPorTelefone(criarDb(t), 'e1', '5544', 'alvo', 'lead-1', 15)

    expect(r.count).toBe(2)
    expect(t.documentos.map((d) => d.pessoa_id)).toEqual(['alvo', 'alvo'])
    expect(t.documento_vinculos.map((v) => v.entidade_id)).toEqual(['lead-1', 'lead-1'])
  })
})
