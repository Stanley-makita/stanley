import { describe, it, expect, vi, beforeEach } from 'vitest'

const fakeState = {
  processoExiste: true,
  compradores: [
    { id: 'comprador-1', nome: 'Comprador Ativo', telefone: '5511900000000' },
    { id: 'comprador-2', nome: 'Comprador Sem Telefone', telefone: null },
  ] as Array<{ id: string; nome: string; telefone: string | null }>,
  corretorVinculos: [
    { corretor: { id: 'corretor-1', nome: 'Corretor Ativo', telefone: '5511988887777', ativo: true } },
    { corretor: { id: 'corretor-2', nome: 'Corretor Inativo', telefone: '5511977776666', ativo: false } },
  ] as Array<{ corretor: { id: string; nome: string; telefone: string | null; ativo: boolean } }>,
  parceiroVinculos: [
    { parceiro: { id: 'parceiro-1', nome: 'Parceiro Ativo', telefone: '5511955554444', ativo: true } },
  ] as Array<{ parceiro: { id: string; nome: string; telefone: string | null; ativo: boolean } }>,
  imobiliariaVinculos: [
    { papel: 'imobiliaria', imobiliaria: { id: 'imob-1', nome: 'Imobiliária Ativa', telefone: '5511944443333', ativo: true } },
    { papel: 'construtora', imobiliaria: { id: 'imob-1', nome: 'Imobiliária Ativa', telefone: '5511944443333', ativo: true } },
  ] as Array<{ papel: 'imobiliaria' | 'construtora'; imobiliaria: { id: string; nome: string; telefone: string | null; ativo: boolean } }>,
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
        in: () => proxy,
        single: async () => {
          if (tabela === 'usuarios') return { data: { id: 'usuario-1', empresa_id: 'empresa-1' }, error: null }
          if (tabela === 'processos') {
            if (!fakeState.processoExiste) return { data: null, error: null }
            return { data: { id: 'processo-1' }, error: null }
          }
          return { data: null, error: null }
        },
      })
      // Tabelas de junção — .select().eq(...) [.in(...)] sem .single()/.maybeSingle() resolvem
      // direto como array via await, padrão do supabase-js para queries de lista.
      if (tabela === 'processo_compradores') {
        return { select: () => ({ eq: async () => ({ data: fakeState.compradores, error: null }) }) }
      }
      if (tabela === 'processo_corretores') {
        return { select: () => ({ eq: async () => ({ data: fakeState.corretorVinculos, error: null }) }) }
      }
      if (tabela === 'processo_parceiros') {
        return { select: () => ({ eq: async () => ({ data: fakeState.parceiroVinculos, error: null }) }) }
      }
      if (tabela === 'processo_imobiliarias') {
        return { select: () => ({ eq: () => ({ in: async () => ({ data: fakeState.imobiliariaVinculos, error: null }) }) }) }
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
  return new Request('http://localhost/api/processos/processo-1/interessados', {
    method: 'GET',
    headers: { Authorization: 'Bearer token-teste' },
  }) as unknown as import('next/server').NextRequest
}

describe('GET /api/processos/[id]/interessados', () => {
  beforeEach(() => {
    fakeState.processoExiste = true
  })

  it('lista todos os compradores, corretores, parceiros e imobiliárias/construtoras, inclusive sem telefone/inativos', async () => {
    const { GET } = await import('../route')
    const response = await GET(montarRequest(), { params: { id: 'processo-1' } })
    const body = await response.json()

    expect(response.status).toBe(200)
    // 2 compradores + 2 corretores + 1 parceiro + 2 vínculos de imobiliária (imobiliaria+construtora)
    expect(body.interessados).toHaveLength(7)

    const compradorAtivo = body.interessados.find((i: { interessado_id: string }) => i.interessado_id === 'comprador-1')
    expect(compradorAtivo).toMatchObject({ tipo_interessado: 'comprador', apto: true, motivo_indisponibilidade: null })

    const compradorSemTelefone = body.interessados.find((i: { interessado_id: string }) => i.interessado_id === 'comprador-2')
    expect(compradorSemTelefone).toMatchObject({ apto: false, motivo_indisponibilidade: 'Telefone não cadastrado' })

    const corretorInativo = body.interessados.find((i: { interessado_id: string }) => i.interessado_id === 'corretor-2')
    expect(corretorInativo).toMatchObject({ apto: false, motivo_indisponibilidade: 'Corretor inativo' })

    const construtora = body.interessados.find((i: { tipo_interessado: string }) => i.tipo_interessado === 'construtora')
    expect(construtora).toMatchObject({ interessado_id: 'imob-1', apto: true })
  })

  it('Negócio não encontrado retorna 404', async () => {
    fakeState.processoExiste = false
    const { GET } = await import('../route')
    const response = await GET(montarRequest(), { params: { id: 'processo-inexistente' } })
    expect(response.status).toBe(404)
  })
})
