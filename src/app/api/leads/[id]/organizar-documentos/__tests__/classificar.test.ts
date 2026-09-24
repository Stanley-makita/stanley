import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const estado = vi.hoisted(() => ({
  classificados: [] as string[],
  tipos: {} as Record<string, string | null>,
}))

vi.mock('@/lib/documentos/contextoLeadServidor', () => ({
  resolverUsuarioELead: async () => ({
    usuario: { id: 'u1', empresa_id: 'e1' },
    lead: { id: 'lead-1', pessoa_id: 'pessoa-1' },
  }),
  carregarDocumentosDoLead: async () => ({
    docs: [
      { id: 'd1', pessoa_id: 'pessoa-1', classificacao_legado: null },
      { id: 'd2', pessoa_id: 'vend-1', classificacao_legado: null },
      { id: 'd3', pessoa_id: 'pessoa-1', classificacao_legado: null },
      { id: 'd4', pessoa_id: 'pessoa-1', classificacao_legado: null },
      { id: 'd5', pessoa_id: 'pessoa-1', classificacao_legado: null },
      { id: 'd6', pessoa_id: 'pessoa-1', classificacao_legado: null },
    ],
    idsComVinculoLead: new Set(['d1', 'd2', 'd3', 'd4', 'd5', 'd6']),
  }),
  carregarVendedoresDoLead: async () => ['vend-1'],
  carregarPastaSugeridaPorTipo: async () => new Map([['cnh', 'comprador'], ['rg', 'comprador']]),
}))

vi.mock('@/lib/documentos/ocr', () => ({
  classificarDocumentoPorId: async (id: string) => {
    estado.classificados.push(id)
    const tipo = estado.tipos[id] ?? null
    return tipo ? { tipo } : { tipo: null, motivo: 'erro' }
  },
}))

function req(body: unknown) {
  return new NextRequest('http://localhost/api/leads/lead-1/organizar-documentos/classificar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer t' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => { estado.classificados = []; estado.tipos = {} })

describe('POST organizar-documentos/classificar', () => {
  it('sugere Comprador pelo tipo e Vendedor pelo dono do documento', async () => {
    estado.tipos = { d1: 'cnh', d2: 'rg' }
    const { POST } = await import('../classificar/route')
    const res = await POST(req({ documento_ids: ['d1', 'd2'] }), { params: { id: 'lead-1' } })
    const json = await res.json()
    expect(json.itens).toEqual([
      { documento_id: 'd1', tipo: 'cnh', pasta_sugerida_codigo: 'comprador' },
      { documento_id: 'd2', tipo: 'rg', pasta_sugerida_codigo: 'vendedor' },
    ])
  })

  it('ignora documento que não é do lead', async () => {
    estado.tipos = { d1: 'cnh' }
    const { POST } = await import('../classificar/route')
    await POST(req({ documento_ids: ['d1', 'de-outro-lead'] }), { params: { id: 'lead-1' } })
    expect(estado.classificados).toEqual(['d1'])
  })

  it('falha em um documento não derruba os outros', async () => {
    estado.tipos = { d1: 'cnh', d2: null }
    const { POST } = await import('../classificar/route')
    const json = await (await POST(req({ documento_ids: ['d1', 'd2'] }), { params: { id: 'lead-1' } })).json()
    expect(json.itens[1]).toEqual({ documento_id: 'd2', tipo: null, pasta_sugerida_codigo: null, motivo: 'erro' })
  })

  it('requisição com 6 ids só classifica os 4 primeiros (MAX_DOCUMENTOS_POR_REQUISICAO)', async () => {
    estado.tipos = { d1: 'cnh', d2: 'rg', d3: 'cnh', d4: 'rg', d5: 'cnh', d6: 'rg' }
    const { POST } = await import('../classificar/route')
    const json = await (await POST(req({ documento_ids: ['d1', 'd2', 'd3', 'd4', 'd5', 'd6'] }), { params: { id: 'lead-1' } })).json()
    expect(estado.classificados).toEqual(['d1', 'd2', 'd3', 'd4'])
    expect(json.itens).toHaveLength(4)
  })
})
