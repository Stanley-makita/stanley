/**
 * `/api/push/unsubscribe`: sempre filtra por usuario_id do token além do endpoint — um
 * usuário nunca pode desativar a inscrição de outro, mesmo sabendo o endpoint dele.
 */
import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'

const USUARIO = 'usuario-andresa'

const estado = vi.hoisted(() => ({ filtros: [] as Record<string, unknown>[] }))

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    auth: {
      getUser: async (token: string) =>
        token === 'token-valido'
          ? { data: { user: { id: 'auth-user-1' } }, error: null }
          : { data: { user: null }, error: new Error('inválido') },
    },
    from(tabela: string) {
      if (tabela === 'usuarios') {
        const q: Record<string, unknown> = {}
        q.select = () => q
        q.eq = () => q
        q.single = () => Promise.resolve({ data: { id: USUARIO }, error: null })
        return q
      }
      if (tabela === 'push_subscriptions') {
        const filtro: Record<string, unknown> = {}
        const q: Record<string, unknown> = {}
        q.update = () => q
        q.eq = (col: string, v: unknown) => {
          filtro[col] = v
          if (Object.keys(filtro).length === 2) { estado.filtros.push({ ...filtro }); return Promise.resolve({ error: null }) }
          return q
        }
        return q
      }
      throw new Error(`tabela inesperada: ${tabela}`)
    },
  },
}))

function montarRequest(body: unknown, token?: string) {
  return new NextRequest('http://localhost/api/push/unsubscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  })
}

describe('POST /api/push/unsubscribe', () => {
  it('desativa filtrando por endpoint E usuario_id do token', async () => {
    estado.filtros = []
    const { POST } = await import('../route')
    const res = await POST(montarRequest({ endpoint: 'https://push.exemplo/abc' }, 'token-valido'))
    expect(res.status).toBe(200)
    expect(estado.filtros).toEqual([{ endpoint: 'https://push.exemplo/abc', usuario_id: USUARIO }])
  })

  it('sem token: 401', async () => {
    const { POST } = await import('../route')
    const res = await POST(montarRequest({ endpoint: 'x' }))
    expect(res.status).toBe(401)
  })
})
