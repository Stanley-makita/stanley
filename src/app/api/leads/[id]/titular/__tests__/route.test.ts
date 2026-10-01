import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import type { Row } from '@/lib/documentos/__tests__/helpers/fakeDb'

const estado = vi.hoisted(() => ({ tabelas: {} as Record<string, Row[]>, negado: false, conflitoLead: false }))

vi.mock('@/lib/supabase/admin', async () => {
  const { criarFakeDb } = await import('@/lib/documentos/__tests__/helpers/fakeDb')
  return {
    supabaseAdmin: {
      from: (t: string) => {
        const db = criarFakeDb(estado.tabelas, { unicos: { lead_coparticipantes: ['lead_id', 'pessoa_id'] } }).from(t) as Record<string, unknown>
        // Simula o índice leads_pessoa_aberto_unico: novo titular já é titular de outro lead aberto.
        if (t === 'leads' && estado.conflitoLead) {
          const original = db.update as (p: Row) => unknown
          db.update = (p: Row) => {
            if ('pessoa_id' in p) {
              const erro = { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "leads_pessoa_aberto_unico"' } }
              const c: Record<string, unknown> = {}
              for (const m of ['eq', 'is', 'select']) c[m] = () => c
              c.then = (res: (v: unknown) => unknown) => Promise.resolve(erro).then(res)
              return c
            }
            return original(p)
          }
        }
        return db
      },
    },
  }
})
vi.mock('@/lib/documentos/vinculosServidor', () => ({
  autenticarRota: async () => ({ usuario: { id: 'u1', empresa_id: 'e1', perfil: 'comercial', nome: 'Ana' }, token: 't' }),
  verificarDestino: async () => estado.negado ? NextResponse.json({ error: 'x' }, { status: 403 }) : null,
}))

beforeEach(() => {
  estado.negado = false
  estado.conflitoLead = false
  estado.tabelas = {
    leads: [{ id: 'l1', empresa_id: 'e1', pessoa_id: 'heitor', nome: 'Heitor', cpf: '52998224725', data_nascimento: '1996-03-14',
      telefone: '44999990000', conjuge_pessoa_id: 'carla', conjuge_nome: 'Carla', conjuge_cpf: null, deleted_at: null }],
    participacoes: [
      { id: 'p-h', empresa_id: 'e1', lead_id: 'l1', pessoa_id: 'heitor', papel: 'titular', compoe_renda: true, compoe_renda_manual: null },
      { id: 'p-c', empresa_id: 'e1', lead_id: 'l1', pessoa_id: 'carla', papel: 'conjuge_anuente', compoe_renda: false, compoe_renda_manual: null },
      { id: 'p-a', empresa_id: 'e1', lead_id: 'l1', pessoa_id: 'afranio', papel: 'coparticipante', compoe_renda: true, compoe_renda_manual: null },
    ],
    lead_coparticipantes: [{ id: 'lc-a', empresa_id: 'e1', lead_id: 'l1', pessoa_id: 'afranio' }],
    pessoas: [
      { id: 'heitor', nome: 'Heitor', cpf: '52998224725', data_nascimento: '1996-03-14', deleted_at: null },
      { id: 'afranio', nome: 'Afrânio Souza', cpf: '11144477735', data_nascimento: '1964-08-02', deleted_at: null },
      { id: 'carla', nome: 'Carla', cpf: null, data_nascimento: null, deleted_at: null },
    ],
    lead_historico: [],
  }
})

const req = (body: unknown) => new NextRequest('http://localhost/api/leads/l1/titular', {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer t' }, body: JSON.stringify(body),
})
const ctx = { params: { id: 'l1' } }
const lead = () => estado.tabelas.leads[0]
const copart = () => estado.tabelas.lead_coparticipantes.map(c => c.pessoa_id).sort()

describe('POST /api/leads/[id]/titular', () => {
  it('troca o principal: antigo e o cônjuge dele ficam como participantes; lead acompanha a identidade do novo', async () => {
    const { POST } = await import('../route')
    const res = await POST(req({ pessoa_id: 'afranio' }), ctx)
    expect(res.status).toBe(200)
    expect(lead()).toMatchObject({ pessoa_id: 'afranio', nome: 'Afrânio Souza', cpf: '11144477735', data_nascimento: '1964-08-02' })
    expect(lead().telefone).toBe('44999990000')          // contato do lead não muda
    expect(lead()).toMatchObject({ conjuge_pessoa_id: null, conjuge_nome: null }) // cônjuge do antigo não vira do novo
    expect(copart()).toEqual(['carla', 'heitor'])          // antigo + cônjuge dele entram; novo sai
    expect(estado.tabelas.lead_historico[0].descricao).toContain('Afrânio Souza')
  })

  it('congela o "compõe renda" de todos antes da troca (a sincronização não muda sozinho)', async () => {
    const { POST } = await import('../route')
    await POST(req({ pessoa_id: 'afranio' }), ctx)
    const manual = Object.fromEntries(estado.tabelas.participacoes.map(p => [p.pessoa_id, p.compoe_renda_manual]))
    expect(manual).toEqual({ heitor: true, carla: false, afranio: true })
  })

  it('pessoa que não participa da proposta: 422 e nada muda', async () => {
    const { POST } = await import('../route')
    const res = await POST(req({ pessoa_id: 'estranho' }), ctx)
    expect(res.status).toBe(422)
    expect(lead().pessoa_id).toBe('heitor')
    expect(copart()).toEqual(['afranio'])
  })

  it('já é o principal: 200 sem mudar nada', async () => {
    const { POST } = await import('../route')
    const res = await POST(req({ pessoa_id: 'heitor' }), ctx)
    expect(res.status).toBe(200)
    expect(estado.tabelas.lead_historico).toHaveLength(0)
  })

  it('sem permissão no lead: 403', async () => {
    estado.negado = true
    const { POST } = await import('../route')
    expect((await POST(req({ pessoa_id: 'afranio' }), ctx)).status).toBe(403)
    expect(lead().pessoa_id).toBe('heitor')
  })

  it('novo principal já é titular de outro lead aberto: 409 com mensagem clara e participantes desfeitos', async () => {
    estado.conflitoLead = true
    const { POST } = await import('../route')
    const res = await POST(req({ pessoa_id: 'afranio' }), ctx)
    expect(res.status).toBe(409)
    expect((await res.json()).error).toContain('outro lead aberto')
    expect(lead().pessoa_id).toBe('heitor')
    expect(copart()).toEqual(['afranio'])
  })
})
