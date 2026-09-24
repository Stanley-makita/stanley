import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const estado = vi.hoisted(() => ({
  updates: [] as Array<{ valores: unknown; filtros: Record<string, unknown> }>,
  inserts: [] as unknown[],
  tocouDocumentos: false,
  linhasAfetadasUpdate: 1,
}))

vi.mock('@/lib/documentos/contextoLeadServidor', () => ({
  resolverUsuarioELead: async () => ({
    usuario: { id: 'u1', empresa_id: 'e1' },
    lead: { id: 'lead-1', pessoa_id: 'pessoa-1' },
  }),
  carregarDocumentosDoLead: async () => ({
    docs: [{ id: 'd1', pessoa_id: 'pessoa-1', classificacao_legado: 'cnh' }, { id: 'd2', pessoa_id: 'pessoa-1', classificacao_legado: 'rg' }],
    idsComVinculoLead: new Set(['d1']),
  }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from(tabela: string) {
      if (tabela === 'documentos') { estado.tocouDocumentos = true }
      const filtros: Record<string, unknown> = {}
      const q: Record<string, unknown> = {}
      q.eq = (k: string, v: unknown) => { filtros[k] = v; return q }
      q.update = (valores: unknown) => { estado.updates.push({ valores, filtros }); return q }
      q.select = () => Promise.resolve({ data: Array(estado.linhasAfetadasUpdate).fill({ id: 'v' }), error: null })
      q.insert = (rows: unknown) => { estado.inserts.push(rows); return { select: () => Promise.resolve({ data: [{ id: 'novo' }], error: null }) } }
      return q
    },
  },
}))

function req(body: unknown) {
  return new NextRequest('http://localhost/api/leads/lead-1/organizar-documentos/aplicar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer t' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => { estado.updates = []; estado.inserts = []; estado.tocouDocumentos = false; estado.linhasAfetadasUpdate = 1 })

describe('POST organizar-documentos/aplicar', () => {
  it('atualiza vínculo existente e cria vínculo pra doc só da Pessoa, sem tocar em documentos', async () => {
    const { POST } = await import('../aplicar/route')
    const res = await POST(req({ itens: [{ documento_id: 'd1', pasta_id: 'pA' }, { documento_id: 'd2', pasta_id: 'pB' }] }), { params: { id: 'lead-1' } })
    expect(await res.json()).toEqual({ ok: true, atualizados: 1, criados: 1 })
    expect(estado.updates[0].valores).toEqual({ pasta_id: 'pA' })
    expect(estado.inserts[0]).toEqual([expect.objectContaining({
      documento_id: 'd2', entidade_tipo: 'lead', entidade_id: 'lead-1', pasta_id: 'pB', empresa_id: 'e1', vinculado_por: 'u1',
    })])
    expect(estado.tocouDocumentos).toBe(false)
  })

  it('ignora documento que não é do lead', async () => {
    const { POST } = await import('../aplicar/route')
    await POST(req({ itens: [{ documento_id: 'de-outro', pasta_id: 'pA' }] }), { params: { id: 'lead-1' } })
    expect(estado.updates).toHaveLength(0)
    expect(estado.inserts).toHaveLength(0)
  })

  it('UPDATE sem linha afetada vira erro, não sucesso', async () => {
    estado.linhasAfetadasUpdate = 0
    const { POST } = await import('../aplicar/route')
    const res = await POST(req({ itens: [{ documento_id: 'd1', pasta_id: 'pA' }] }), { params: { id: 'lead-1' } })
    expect(res.status).toBe(500)
  })
})
