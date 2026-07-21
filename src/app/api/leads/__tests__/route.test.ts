import { describe, it, expect, vi, beforeEach } from 'vitest'

// Estado mutável do usuário autenticado, lido pelo fake em tempo de chamada.
const fakeState = {
  perfil: 'comercial' as string,
}

const getUserMock = vi.fn(async () => ({ data: { user: { id: 'auth-user-1' } }, error: null }))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
  })),
}))

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: (tabela: string) => {
      const proxy: Record<string, unknown> = {}
      Object.assign(proxy, {
        select: () => proxy,
        or: () => proxy,
        eq: () => proxy,
        is: () => proxy,
        insert: () => proxy,
        single: async () => {
          if (tabela === 'usuarios') {
            return { data: { empresa_id: 'empresa-1', perfil: fakeState.perfil }, error: null }
          }
          return { data: null, error: null }
        },
        maybeSingle: async () => ({ data: null, error: null }),
      })
      return proxy
    },
  },
}))

const buscarOuCriarPessoaMock = vi.fn(async () => 'pessoa-1')
vi.mock('@/lib/pessoa', () => ({
  buscarOuCriarPessoa: buscarOuCriarPessoaMock,
}))

const obterOrdemTopoMock = vi.fn(async () => 0)
vi.mock('@/lib/leads/ordem', () => ({
  obterOrdemTopo: obterOrdemTopoMock,
}))

function montarRequest(body: unknown) {
  return new Request('http://localhost/api/leads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as import('next/server').NextRequest
}

const corpoValido = {
  nome: 'Cliente Teste',
  telefone: '5511900000000',
  fase_id: 'fase-1',
  origem: 'site' as const,
}

describe('POST /api/leads — check de perfil (leads.criar)', () => {
  beforeEach(() => {
    fakeState.perfil = 'comercial'
    getUserMock.mockClear()
    buscarOuCriarPessoaMock.mockClear()
    obterOrdemTopoMock.mockClear()
  })

  it('403 para perfil sem leads.criar (apoio), sem nenhum efeito colateral', async () => {
    fakeState.perfil = 'apoio'
    const { POST } = await import('../route')

    const response = await POST(montarRequest(corpoValido))
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body.error).toBe('Sem permissão para criar leads')
    expect(buscarOuCriarPessoaMock).not.toHaveBeenCalled()
    expect(obterOrdemTopoMock).not.toHaveBeenCalled()
  })

  it('403 para perfil sem leads.criar (juridico)', async () => {
    fakeState.perfil = 'juridico'
    const { POST } = await import('../route')

    const response = await POST(montarRequest(corpoValido))
    expect(response.status).toBe(403)
    expect(buscarOuCriarPessoaMock).not.toHaveBeenCalled()
  })

  it('prossegue (sem 403) para admin', async () => {
    fakeState.perfil = 'admin'
    const { POST } = await import('../route')

    const response = await POST(montarRequest(corpoValido))
    expect(response.status).not.toBe(403)
    expect(buscarOuCriarPessoaMock).toHaveBeenCalled()
  })

  it('prossegue (sem 403) para gestor', async () => {
    fakeState.perfil = 'gestor'
    const { POST } = await import('../route')

    const response = await POST(montarRequest(corpoValido))
    expect(response.status).not.toBe(403)
    expect(buscarOuCriarPessoaMock).toHaveBeenCalled()
  })

  it('prossegue (sem 403) para comercial', async () => {
    fakeState.perfil = 'comercial'
    const { POST } = await import('../route')

    const response = await POST(montarRequest(corpoValido))
    expect(response.status).not.toBe(403)
    expect(buscarOuCriarPessoaMock).toHaveBeenCalled()
  })
})
