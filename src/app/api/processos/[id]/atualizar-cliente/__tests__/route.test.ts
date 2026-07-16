import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Fake de supabase cobrindo as tabelas usadas pelo endpoint: usuarios, processos,
// processo_compradores, mensagens_processos (com UNIQUE(envio_id) simulado),
// conversas, instancias, mensagens, processo_comentarios.
function criarFakeSupabase() {
  const envioIds = new Set<string>()
  const escritas: Array<{ tabela: string; metodo: string; valores?: unknown }> = []
  let processoComentariosInseridos = 0

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
        update: (valores: unknown) => {
          escritas.push({ tabela, metodo: 'update', valores })
          return proxy
        },
        insert: (valores: Record<string, unknown>) => {
          if (tabela === 'mensagens_processos') {
            const envioId = valores.envio_id as string
            if (envioIds.has(envioId)) {
              return {
                select: () => ({
                  single: async () => ({ data: null, error: { code: '23505', message: 'duplicate key' } }),
                }),
              }
            }
            envioIds.add(envioId)
          }
          if (tabela === 'processo_comentarios') processoComentariosInseridos++
          escritas.push({ tabela, metodo: 'insert', valores })
          return proxy
        },
        maybeSingle: async () => {
          if (tabela === 'conversas') return { data: null, error: null } // sem conversa existente
          if (tabela === 'instancias') return { data: null, error: null }
          return { data: null, error: null }
        },
        single: async () => {
          if (tabela === 'usuarios') {
            return { data: { id: 'usuario-1', empresa_id: 'empresa-1', nome: 'Fulano de Tal' }, error: null }
          }
          if (tabela === 'processos') {
            return { data: { id: 'processo-1', empresa_id: 'empresa-1', lead_id: null }, error: null }
          }
          if (tabela === 'processo_compradores') {
            return { data: { id: 'comprador-1', nome: 'Cliente Teste', telefone: '5511900000000', pessoa_id: null }, error: null }
          }
          if (tabela === 'mensagens_processos') {
            return { data: { id: 'vinculo-1' }, error: null }
          }
          if (tabela === 'conversas') {
            return { data: { id: 'conversa-nova-1' }, error: null }
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

  return { client, escritas, get processoComentariosInseridos() { return processoComentariosInseridos } }
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => criarFakeSupabase().client),
}))

// O mock acima cria um client novo por chamada de createClient(), mas o módulo da rota chama
// createClient() uma única vez no import (top-level) — então todos os testes deste arquivo
// compartilham a MESMA instância de fake (mesmo Set de envio_ids), o que é exatamente o que
// queremos para testar duplicidade entre duas requisições.

function montarRequest(body: unknown) {
  return new Request('http://localhost/api/processos/processo-1/atualizar-cliente', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-teste' },
    body: JSON.stringify(body),
  }) as unknown as import('next/server').NextRequest
}

describe('POST /api/processos/[id]/atualizar-cliente', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ messageid: 'uazapi-msg-abc' }),
      text: async () => '',
    })
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reivindica o envio, resolve/cria conversa, envia e registra no histórico do Negócio', async () => {
    const { POST } = await import('../route')
    const envioId = 'envio-' + Date.now()

    const response = await POST(montarRequest({
      comprador_id: 'comprador-1',
      texto: 'Olá, atualização do seu negócio!',
      envio_id: envioId,
    }), { params: { id: 'processo-1' } })

    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.mensagem_id).toBe('mensagem-db-1')
  })

  it('segunda chamada com o mesmo envio_id não reprocessa (idempotência própria, sem fonti_events)', async () => {
    const { POST } = await import('../route')
    const envioId = 'envio-duplicado-' + Date.now()

    const r1 = await POST(montarRequest({
      comprador_id: 'comprador-1',
      texto: 'Mensagem original',
      envio_id: envioId,
    }), { params: { id: 'processo-1' } })
    expect((await r1.json()).ok).toBe(true)

    const chamadasAntes = fetchMock.mock.calls.length

    const r2 = await POST(montarRequest({
      comprador_id: 'comprador-1',
      texto: 'Mensagem original',
      envio_id: envioId,
    }), { params: { id: 'processo-1' } })
    const body2 = await r2.json()

    expect(body2).toEqual({ ok: true, duplicado: true })
    // Nenhuma nova chamada à Uazapi na segunda tentativa.
    expect(fetchMock.mock.calls.length).toBe(chamadasAntes)
  })

  it('exige comprador_id, texto e envio_id', async () => {
    const { POST } = await import('../route')
    const response = await POST(montarRequest({ texto: 'oi' }), { params: { id: 'processo-1' } })
    expect(response.status).toBe(422)
  })
})
