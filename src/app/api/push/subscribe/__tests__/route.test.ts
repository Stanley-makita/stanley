/**
 * `/api/push/subscribe`: o `usuario_id` gravado tem que vir sempre do token autenticado,
 * nunca de algo que o client mande no corpo — senão um usuário poderia registrar a
 * inscrição de push em nome de outro.
 */
import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'

const USUARIO = 'usuario-andresa'

const estado = vi.hoisted(() => ({ escritas: [] as Array<{ valores: unknown }> }))

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
        const q: Record<string, unknown> = {}
        q.upsert = (valores: unknown) => { estado.escritas.push({ valores }); return Promise.resolve({ error: null }) }
        return q
      }
      throw new Error(`tabela inesperada: ${tabela}`)
    },
  },
}))

function montarRequest(body: unknown, token?: string) {
  return new NextRequest('http://localhost/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  })
}

describe('POST /api/push/subscribe', () => {
  it('sem token: 401, não grava nada', async () => {
    estado.escritas = []
    const { POST } = await import('../route')
    const res = await POST(montarRequest({ endpoint: 'x', keys: { p256dh: 'a', auth: 'b' } }))
    expect(res.status).toBe(401)
    expect(estado.escritas).toHaveLength(0)
  })

  it('com token válido: grava usuario_id resolvido do token, nunca do corpo', async () => {
    estado.escritas = []
    const { POST } = await import('../route')
    const res = await POST(montarRequest({
      endpoint: 'https://push.exemplo/abc',
      keys: { p256dh: 'chave-p256dh', auth: 'chave-auth' },
      usuario_id: 'outro-usuario-tentando-forjar', // deve ser ignorado
    }, 'token-valido'))
    expect(res.status).toBe(200)
    expect(estado.escritas).toHaveLength(1)
    expect((estado.escritas[0].valores as { usuario_id: string }).usuario_id).toBe(USUARIO)
  })

  it('sem endpoint/keys: 422', async () => {
    estado.escritas = []
    const { POST } = await import('../route')
    const res = await POST(montarRequest({}, 'token-valido'))
    expect(res.status).toBe(422)
  })
})
