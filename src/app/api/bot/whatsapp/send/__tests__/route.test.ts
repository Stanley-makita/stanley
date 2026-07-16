import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Único mock necessário para importar route.ts com segurança: `@supabase/supabase-js`
// é chamado no nível de módulo (createClient no topo do arquivo). Ver o mesmo padrão em
// src/app/api/bot/whatsapp/webhook/__tests__/route.test.ts.
function criarFakeSupabase() {
  const inserts: Array<{ tabela: string; valores: unknown }> = []

  const client = {
    auth: {
      getUser: async (_token: string) => ({
        data: { user: { id: 'auth-user-1' } },
        error: null,
      }),
    },
    from(tabela: string) {
      const proxy: Record<string, unknown> = {}
      Object.assign(proxy, {
        select: () => proxy,
        eq: () => proxy,
        update: (valores: unknown) => {
          inserts.push({ tabela: `${tabela}:update`, valores })
          return proxy
        },
        insert: (valores: unknown) => {
          inserts.push({ tabela: `${tabela}:insert`, valores })
          return proxy
        },
        maybeSingle: async () => {
          if (tabela === 'instancias') return { data: null, error: null }
          return { data: null, error: null }
        },
        single: async () => {
          if (tabela === 'usuarios') {
            return { data: { id: 'usuario-1', empresa_id: 'empresa-1', nome: 'Fulano de Tal' }, error: null }
          }
          if (tabela === 'conversas') {
            return { data: { id: 'conversa-1', instancia_id: null }, error: null }
          }
          if (tabela === 'mensagens') {
            return { data: { id: 'mensagem-db-1' }, error: null }
          }
          return { data: null, error: null }
        },
      })
      return proxy
    },
  }

  return { client, inserts }
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => criarFakeSupabase().client),
}))

describe('POST /api/bot/whatsapp/send', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ messageid: 'uazapi-msg-123' }),
      text: async () => '',
    })
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('envia texto e devolve mensagem_id (linha inserida em mensagens) além de message_id (Uazapi)', async () => {
    const { POST } = await import('../route')
    const { NextRequest } = await import('next/server')

    const request = new NextRequest('http://localhost/api/bot/whatsapp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-teste' },
      body: JSON.stringify({
        conversa_id: 'conversa-1',
        telefone: '5511900000000',
        tipo: 'text',
        texto: 'Olá, mensagem de teste',
      }),
    })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    // Comportamento já existente (Uazapi messageid) preservado — sem regressão.
    expect(body.message_id).toBe('uazapi-msg-123')
    // Novo campo aditivo.
    expect(body.mensagem_id).toBe('mensagem-db-1')
  })

  it('continua exigindo conversa_id, telefone e tipo (retrocompatibilidade de validação)', async () => {
    const { POST } = await import('../route')
    const { NextRequest } = await import('next/server')

    const request = new NextRequest('http://localhost/api/bot/whatsapp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-teste' },
      body: JSON.stringify({ telefone: '5511900000000', tipo: 'text', texto: 'oi' }),
    })

    const response = await POST(request)
    expect(response.status).toBe(422)
  })
})
