/**
 * Regressão (2026-09-22): busca de Vendedor (papel diferente de Comprador/Cliente) ficava
 * sempre vazia para um comercial, porque a rota reaplicava a mesma restrição de carteira
 * usada pra Pessoa-cliente (migration 20260724_186/20260801_228) — um vendedor não é
 * "cliente" de ninguém, pode ter sido cadastrado por outro comercial ou sem lead nenhum.
 * `papel=vendedor` ignora a restrição de carteira; sem esse param, o comportamento (e a
 * proteção de privacidade entre comerciais) continua igual.
 */
import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/auth/resolverPermissaoServidor', () => ({
  podeServidor: vi.fn().mockResolvedValue(true),
}))

const EMPRESA = 'empresa-1'
const ANDRESA = 'u-andresa'

const PESSOAS = [
  { id: 'p-cliente-1', nome: 'Cliente Da Andresa', cpf: null, email: null, created_at: '2026-01-01', empresa_id: EMPRESA },
  { id: 'p-vendedor-fora', nome: 'Vendedor Fora Da Carteira', cpf: null, email: null, created_at: '2026-01-02', empresa_id: EMPRESA },
]

// leads: só o p-cliente-1 tem lead com responsavel_id = Andresa — define a "carteira" dela.
const LEADS = [
  { pessoa_id: 'p-cliente-1', responsavel_id: ANDRESA, deleted_at: null },
]

function criarFakeSupabase() {
  const client = {
    auth: {
      getUser: async (_token: string) => ({ data: { user: { id: 'auth-andresa' } }, error: null }),
    },
    from(tabela: string) {
      if (tabela === 'usuarios') {
        const q: Record<string, unknown> = {}
        q.select = () => q
        q.eq = () => q
        q.single = () => Promise.resolve({ data: { id: ANDRESA, empresa_id: EMPRESA, perfil: 'comercial' }, error: null })
        return q
      }
      if (tabela === 'leads') {
        // .select('pessoa_id').eq('responsavel_id', uid).is('deleted_at', null).not('pessoa_id', 'is', null)
        const q: Record<string, unknown> = {}
        q.select = () => q
        q.eq = () => q
        q.is = () => q
        q.not = () => Promise.resolve({ data: LEADS.map((l) => ({ pessoa_id: l.pessoa_id })), error: null })
        return q
      }
      if (tabela === 'pessoas') {
        // Filtros compõem em E (AND), como as chamadas reais do query builder do
        // Supabase — .ilike() seguido de .in() restringe ainda mais, não substitui.
        const filtros: Array<(p: (typeof PESSOAS)[number]) => boolean> = []
        const q: Record<string, unknown> = {}
        q.select = () => q
        q.eq = (col: string, v: string) => { filtros.push((p) => (p as Record<string, unknown>)[col] === v); return q }
        q.order = () => q
        q.range = () => q
        q.in = (col: string, v: string[]) => { filtros.push((p) => v.includes((p as Record<string, unknown>)[col] as string)); return q }
        q.ilike = (col: string, v: string) => {
          const termo = v.replace(/%/g, '').toLowerCase()
          filtros.push((p) => ((p as Record<string, unknown>)[col] as string).toLowerCase().includes(termo))
          return q
        }
        q.then = (resolve: (v: { data: unknown[]; count: number; error: null }) => unknown) => {
          const linhas = PESSOAS.filter((p) => filtros.every((f) => f(p)))
          return resolve({ data: linhas, count: linhas.length, error: null })
        }
        return q
      }
      throw new Error(`tabela inesperada no mock: ${tabela}`)
    },
  }
  return client
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => criarFakeSupabase()),
}))

function montarRequest(qs: string) {
  return new NextRequest(`http://localhost/api/pessoas?${qs}`, {
    headers: { Authorization: 'Bearer token-teste' },
  })
}

describe('GET /api/pessoas', () => {
  it('sem papel=vendedor: comercial só vê pessoas da própria carteira (comportamento existente, preservado)', async () => {
    const { GET } = await import('../route')
    const res = await GET(montarRequest('q=Vendedor'))
    const json = await res.json()
    expect(json.data).toEqual([])
  })

  it('com papel=vendedor: comercial acha pessoa fora da própria carteira', async () => {
    const { GET } = await import('../route')
    const res = await GET(montarRequest('q=Vendedor&papel=vendedor'))
    const json = await res.json()
    expect(json.data.map((p: { id: string }) => p.id)).toEqual(['p-vendedor-fora'])
  })

  it('papel=vendedor não afeta a busca por CPF/nome de quem já está na carteira', async () => {
    const { GET } = await import('../route')
    const res = await GET(montarRequest('q=Cliente&papel=vendedor'))
    const json = await res.json()
    expect(json.data.map((p: { id: string }) => p.id)).toEqual(['p-cliente-1'])
  })

  it('ids= (pré-preenchimento de vendedor) busca por id, ignora carteira com papel=vendedor', async () => {
    const { GET } = await import('../route')
    const res = await GET(montarRequest('ids=p-vendedor-fora&papel=vendedor'))
    const json = await res.json()
    expect(json.data.map((p: { id: string }) => p.id)).toEqual(['p-vendedor-fora'])
  })
})
