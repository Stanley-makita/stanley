import { describe, it, expect, vi, beforeEach } from 'vitest'

const fakeState = {
  leadExiste: true,
  leadTelefone: '5511900000000' as string | null,
  vinculos: [
    { corretor: { id: 'corretor-1', nome: 'Corretor Ativo', telefone: '5511988887777', ativo: true } },
    { corretor: { id: 'corretor-2', nome: 'Corretor Sem Telefone', telefone: null, ativo: true } },
    { corretor: { id: 'corretor-3', nome: 'Corretor Inativo', telefone: '5511977776666', ativo: false } },
  ] as Array<{ corretor: { id: string; nome: string; telefone: string | null; ativo: boolean } }>,
}

function criarFakeSupabase() {
  const client = {
    auth: {
      getUser: async (_token: string) => ({ data: { user: { id: 'auth-user-1' } }, error: null }),
    },
    from(tabela: string) {
      const proxy: Record<string, unknown> = {}
      Object.assign(proxy, {
        select: () => proxy,
        eq: () => proxy,
        is: () => proxy,
        single: async () => {
          if (tabela === 'usuarios') return { data: { id: 'usuario-1', empresa_id: 'empresa-1' }, error: null }
          if (tabela === 'leads') {
            if (!fakeState.leadExiste) return { data: null, error: null }
            return { data: { id: 'lead-1', nome: 'Cliente Teste', telefone: fakeState.leadTelefone }, error: null }
          }
          return { data: null, error: null }
        },
      })
      // lead_corretores é consultado com .select().eq(...) sem .single()/.maybeSingle() —
      // resolve direto como array via await, padrão do supabase-js para queries de lista.
      if (tabela === 'lead_corretores') {
        return {
          select: () => ({
            eq: async () => ({ data: fakeState.vinculos, error: null }),
          }),
        }
      }
      return proxy
    },
  }
  return { client }
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => criarFakeSupabase().client),
}))

function montarRequest() {
  return new Request('http://localhost/api/leads/lead-1/interessados', {
    method: 'GET',
    headers: { Authorization: 'Bearer token-teste' },
  }) as unknown as import('next/server').NextRequest
}

describe('GET /api/leads/[id]/interessados', () => {
  beforeEach(() => {
    fakeState.leadExiste = true
    fakeState.leadTelefone = '5511900000000'
  })

  it('lista o comprador e todos os corretores vinculados, inclusive sem telefone/inativos', async () => {
    const { GET } = await import('../route')
    const response = await GET(montarRequest(), { params: { id: 'lead-1' } })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.interessados).toHaveLength(4)

    const comprador = body.interessados.find((i: { tipo_interessado: string }) => i.tipo_interessado === 'comprador')
    expect(comprador).toMatchObject({ interessado_id: 'lead-1', nome: 'Cliente Teste', apto: true, motivo_indisponibilidade: null })

    const semTelefone = body.interessados.find((i: { interessado_id: string }) => i.interessado_id === 'corretor-2')
    expect(semTelefone).toMatchObject({ apto: false, motivo_indisponibilidade: 'Telefone não cadastrado' })

    const inativo = body.interessados.find((i: { interessado_id: string }) => i.interessado_id === 'corretor-3')
    expect(inativo).toMatchObject({ apto: false, motivo_indisponibilidade: 'Corretor inativo' })

    const ativo = body.interessados.find((i: { interessado_id: string }) => i.interessado_id === 'corretor-1')
    expect(ativo).toMatchObject({ apto: true, motivo_indisponibilidade: null })
  })

  it('comprador sem telefone aparece na lista, marcado como não apto', async () => {
    fakeState.leadTelefone = null
    const { GET } = await import('../route')
    const response = await GET(montarRequest(), { params: { id: 'lead-1' } })
    const body = await response.json()

    const comprador = body.interessados.find((i: { tipo_interessado: string }) => i.tipo_interessado === 'comprador')
    expect(comprador).toMatchObject({ apto: false, motivo_indisponibilidade: 'Telefone não cadastrado' })
  })

  it('lead não encontrado retorna 404', async () => {
    fakeState.leadExiste = false
    const { GET } = await import('../route')
    const response = await GET(montarRequest(), { params: { id: 'lead-inexistente' } })
    expect(response.status).toBe(404)
  })
})
