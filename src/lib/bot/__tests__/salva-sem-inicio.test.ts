/**
 * Incidente real (2026-09-25, na frente da equipe): comercial mandou PDFs pro número da
 * empresa e depois `*salva fulano` — "Nenhum documento encontrado". Sem `*inicio` o PDF
 * era descartado (ou caía na pessoa errada via fluxo de conversa "humano"), e o `*salva`
 * procurava os documentos pela `conversas.pessoa_id`, que outras mensagens sobrescrevem.
 * Agora todo PDF de comercial abre/reaproveita uma sessão (garantirSessaoMidiaOperador) e o
 * `*salva` procura pela Pessoa da sessão.
 */
import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('@/lib/pessoa', () => ({ buscarOuCriarPessoa: vi.fn() }))
vi.mock('@/lib/workflows/workflow-captacao', () => ({ executarWorkflowCaptacao: vi.fn() }))

type Row = Record<string, unknown>

// Banco falso mínimo: encadeia filtros (eq/in/is/gte/order) e resolve como thenable.
function criarDb(tabelas: Record<string, Row[]>) {
  const from = (tabela: string) => {
    const filtros: Array<(r: Row) => boolean> = []
    let op: 'select' | 'update' | 'insert' | 'upsert' = 'select'
    let patch: Row = {}
    let inseridos: Row[] = []
    let ordem: { col: string; asc: boolean } | null = null
    let ignorarDuplicados = false
    const linhas = () => (tabelas[tabela] ??= [])
    const aplicar = () => {
      if (op === 'insert') { linhas().push(...inseridos); return { data: null, error: null } }
      if (op === 'upsert') {
        for (const novo of inseridos) {
          const existente = linhas().find((r) => r.empresa_id === novo.empresa_id && r.telefone_conversa === novo.telefone_conversa)
          if (!existente) linhas().push({ ...novo })
          else if (!ignorarDuplicados) Object.assign(existente, novo)
        }
        return { data: null, error: null }
      }
      let alvo = linhas().filter((r) => filtros.every((f) => f(r)))
      if (op === 'update') alvo.forEach((r) => Object.assign(r, patch))
      if (ordem) {
        const { col, asc } = ordem
        alvo = [...alvo].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (asc ? 1 : -1))
      }
      return { data: alvo, error: null }
    }
    const b: Record<string, unknown> = {
      select: () => b,
      update: (p: Row) => { op = 'update'; patch = p; return b },
      insert: (r: Row | Row[]) => { op = 'insert'; inseridos = Array.isArray(r) ? r : [r]; return b },
      upsert: (r: Row | Row[], opts?: { ignoreDuplicates?: boolean }) => {
        op = 'upsert'; inseridos = Array.isArray(r) ? r : [r]; ignorarDuplicados = !!opts?.ignoreDuplicates; return b
      },
      eq: (c: string, v: unknown) => { filtros.push((r) => r[c] === v); return b },
      in: (c: string, vs: unknown[]) => { filtros.push((r) => vs.includes(r[c])); return b },
      is: (c: string, v: unknown) => { filtros.push((r) => (r[c] ?? null) === v); return b },
      gte: (c: string, v: string) => { filtros.push((r) => String(r[c]) >= v); return b },
      order: (col: string, o?: { ascending?: boolean }) => { ordem = { col, asc: o?.ascending ?? true }; return b },
      limit: () => b,
      maybeSingle: () => Promise.resolve({ data: aplicar().data?.[0] ?? null, error: null }),
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(aplicar()).then(res, rej),
    }
    return b
  }
  return { from } as unknown as SupabaseClient
}

const haMin = (min: number) => new Date(Date.now() - min * 60_000).toISOString()

describe('vincularDocumentosRecentesPorTelefone — pessoa da sessão', () => {
  it('acha os documentos pela Pessoa da sessão mesmo com conversas.pessoa_id sobrescrita', async () => {
    const { vincularDocumentosRecentesPorTelefone } = await import('../fonti-comandos')
    const t: Record<string, Row[]> = {
      // Outra mensagem do operador (fluxo "humano") trocou a pessoa da conversa.
      conversas: [{ empresa_id: 'e1', canal: 'whatsapp', contato_telefone: '5544', pessoa_id: 'claudia' }],
      documentos: [
        { id: 'd1', empresa_id: 'e1', dominio: 'acervo_documental', pessoa_id: 'sessao', deleted_at: null, recebido_em: haMin(2) },
        { id: 'd2', empresa_id: 'e1', dominio: 'acervo_documental', pessoa_id: 'sessao', deleted_at: null, recebido_em: haMin(1) },
        { id: 'd3', empresa_id: 'e1', dominio: 'acervo_documental', pessoa_id: 'claudia', deleted_at: null, recebido_em: haMin(1) },
      ],
      documento_vinculos: [],
    }
    const r = await vincularDocumentosRecentesPorTelefone(
      criarDb(t), 'e1', '5544', 'alvo', 'lead-1', 15, new Date(haMin(5)), undefined, 'sessao',
    )
    expect(r.count).toBe(2)
    expect(t.documentos.map((d) => d.pessoa_id)).toEqual(['alvo', 'alvo', 'claudia'])
    expect(t.documento_vinculos).toHaveLength(2)
  })
})

describe('garantirSessaoMidiaOperador', () => {
  it('sem sessão: abre uma sessão real (PDF sem *inicio)', async () => {
    const { garantirSessaoMidiaOperador } = await import('../fonti-comandos')
    const t: Record<string, Row[]> = { fonti_marcas: [], documentos: [] }
    await garantirSessaoMidiaOperador(criarDb(t), 'e1', '5544')
    expect(t.fonti_marcas).toHaveLength(1)
    expect(t.fonti_marcas[0]).toMatchObject({ empresa_id: 'e1', telefone_conversa: '5544', sessao_real: true })
  })

  it('sessão real recente: mantém (mesmos documentos, mesma pessoa)', async () => {
    const { garantirSessaoMidiaOperador } = await import('../fonti-comandos')
    const inicio = haMin(10)
    const t: Record<string, Row[]> = {
      fonti_marcas: [{ empresa_id: 'e1', telefone_conversa: '5544', iniciado_at: inicio, sessao_real: true, pessoa_id: 'sessao' }],
      documentos: [],
    }
    await garantirSessaoMidiaOperador(criarDb(t), 'e1', '5544')
    expect(t.fonti_marcas[0]).toMatchObject({ iniciado_at: inicio, pessoa_id: 'sessao' })
  })

  it('sessão antiga mas com documento recente: mantém', async () => {
    const { garantirSessaoMidiaOperador } = await import('../fonti-comandos')
    const inicio = haMin(300)
    const t: Record<string, Row[]> = {
      fonti_marcas: [{ empresa_id: 'e1', telefone_conversa: '5544', iniciado_at: inicio, sessao_real: true, pessoa_id: 'sessao' }],
      documentos: [{ id: 'd1', empresa_id: 'e1', pessoa_id: 'sessao', deleted_at: null, recebido_em: haMin(20) }],
    }
    await garantirSessaoMidiaOperador(criarDb(t), 'e1', '5544')
    expect(t.fonti_marcas[0]).toMatchObject({ iniciado_at: inicio, pessoa_id: 'sessao' })
  })

  it('sessão abandonada (>2h sem atividade): começa lote novo, sem misturar cliente anterior', async () => {
    const { garantirSessaoMidiaOperador } = await import('../fonti-comandos')
    const inicio = haMin(300)
    const t: Record<string, Row[]> = {
      fonti_marcas: [{ empresa_id: 'e1', telefone_conversa: '5544', iniciado_at: inicio, sessao_real: true, pessoa_id: 'antiga', candidatos_pendentes: [{ id: 'x', nome: 'X' }] }],
      documentos: [{ id: 'd1', empresa_id: 'e1', pessoa_id: 'antiga', deleted_at: null, recebido_em: haMin(290) }],
    }
    await garantirSessaoMidiaOperador(criarDb(t), 'e1', '5544')
    expect(t.fonti_marcas[0].pessoa_id).toBeNull()
    expect(t.fonti_marcas[0].candidatos_pendentes).toBeNull()
    expect(String(t.fonti_marcas[0].iniciado_at) > haMin(1)).toBe(true)
  })

  it('marca só de ambiguidade (*salva sem sessão): vira sessão real e preserva os candidatos', async () => {
    const { garantirSessaoMidiaOperador } = await import('../fonti-comandos')
    const candidatos = [{ id: 'p1', nome: 'Joao' }]
    const t: Record<string, Row[]> = {
      fonti_marcas: [{ empresa_id: 'e1', telefone_conversa: '5544', iniciado_at: haMin(1), sessao_real: false, pessoa_id: null, candidatos_pendentes: candidatos }],
      documentos: [],
    }
    await garantirSessaoMidiaOperador(criarDb(t), 'e1', '5544')
    expect(t.fonti_marcas[0]).toMatchObject({ sessao_real: true, pessoa_id: null, candidatos_pendentes: candidatos })
  })
})
