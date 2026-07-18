import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Estado mutável lido em tempo de chamada (não na criação do client) — createClient() só é
// invocado uma vez no import top-level da rota, então os testes ajustam este objeto no
// beforeEach/dentro do it, e os closures do fake (capturados por referência) enxergam a
// mudança nas chamadas seguintes.
const fakeState = {
  leadTelefone: '5511900000000' as string | null,
  leadExiste: true,
  relacionamentoExiste: true,
  corretorVinculoExiste: true,
  corretorAtivo: true,
  corretorTelefone: '5511988887777' as string | null,
}

// Fake de supabase cobrindo as tabelas usadas pelo endpoint: usuarios, leads, lead_corretores
// (join corretores), comunicacao_relacionamentos, mensagens_leads (com UNIQUE(envio_id)
// simulado), conversas, instancias, mensagens, lead_historico.
function criarFakeSupabase() {
  const envioIds = new Set<string>()
  const escritas: Array<{ tabela: string; metodo: string; valores?: unknown }> = []
  let leadHistoricoInseridos = 0
  let comrelInseridos = 0

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
        is: () => proxy,
        limit: () => proxy,
        update: (valores: unknown) => {
          escritas.push({ tabela, metodo: 'update', valores })
          return proxy
        },
        insert: (valores: Record<string, unknown>) => {
          if (tabela === 'mensagens_leads') {
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
          if (tabela === 'comunicacao_relacionamentos') {
            comrelInseridos++
            return {
              select: () => ({
                single: async () => ({ data: { id: 'comrel-novo-1' }, error: null }),
              }),
            }
          }
          if (tabela === 'lead_historico') leadHistoricoInseridos++
          escritas.push({ tabela, metodo: 'insert', valores })
          return proxy
        },
        maybeSingle: async () => {
          if (tabela === 'comunicacao_relacionamentos') {
            return fakeState.relacionamentoExiste ? { data: { id: 'comrel-1' }, error: null } : { data: null, error: null }
          }
          if (tabela === 'lead_corretores') {
            if (!fakeState.corretorVinculoExiste) return { data: null, error: null }
            return {
              data: {
                id: 'lead-corretor-1',
                corretor: { id: 'corretor-1', nome: 'Corretor Teste', telefone: fakeState.corretorTelefone, ativo: fakeState.corretorAtivo },
              },
              error: null,
            }
          }
          if (tabela === 'conversas') return { data: null, error: null } // sem conversa existente
          if (tabela === 'instancias') return { data: null, error: null }
          return { data: null, error: null }
        },
        single: async () => {
          if (tabela === 'usuarios') {
            return { data: { id: 'usuario-1', empresa_id: 'empresa-1', nome: 'Fulano de Tal' }, error: null }
          }
          if (tabela === 'leads') {
            if (!fakeState.leadExiste) return { data: null, error: null }
            return { data: { id: 'lead-1', empresa_id: 'empresa-1', nome: 'Cliente Teste', telefone: fakeState.leadTelefone, pessoa_id: null }, error: null }
          }
          if (tabela === 'mensagens_leads') {
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

  return {
    client,
    escritas,
    get leadHistoricoInseridos() { return leadHistoricoInseridos },
    get comrelInseridos() { return comrelInseridos },
  }
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => criarFakeSupabase().client),
}))

// O mock acima cria um client novo por chamada de createClient(), mas o módulo da rota chama
// createClient() uma única vez no import (top-level) — então todos os testes deste arquivo
// compartilham a MESMA instância de fake (mesmo Set de envio_ids), o que é exatamente o que
// queremos para testar duplicidade entre duas requisições.

function montarRequest(body: unknown) {
  return new Request('http://localhost/api/leads/lead-1/atualizar-cliente', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-teste' },
    body: JSON.stringify(body),
  }) as unknown as import('next/server').NextRequest
}

describe('POST /api/leads/[id]/atualizar-cliente', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fakeState.leadTelefone = '5511900000000'
    fakeState.leadExiste = true
    fakeState.relacionamentoExiste = true
    fakeState.corretorVinculoExiste = true
    fakeState.corretorAtivo = true
    fakeState.corretorTelefone = '5511988887777'
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

  describe('tipo_interessado=comprador', () => {
    it('relacionamento já existe: resolve/cria conversa, envia e registra no histórico do Lead', async () => {
      const { POST } = await import('../route')
      const envioId = 'envio-' + Date.now()

      const response = await POST(montarRequest({
        tipo_interessado: 'comprador',
        interessado_id: 'lead-1',
        texto: 'Olá, atualização do seu atendimento!',
        envio_id: envioId,
      }), { params: { id: 'lead-1' } })

      const body = await response.json()
      expect(response.status).toBe(200)
      expect(body.ok).toBe(true)
      expect(body.mensagem_id).toBe('mensagem-db-1')
      expect(body.relacionamento_id).toBe('comrel-1')
      expect(body.destinatario_nome).toBe('Cliente Teste')
    })

    it('relacionamento ausente (caminho defensivo): cria e o envio prossegue normalmente', async () => {
      fakeState.relacionamentoExiste = false
      const { POST } = await import('../route')
      const envioId = 'envio-comrel-' + Date.now()

      const response = await POST(montarRequest({
        tipo_interessado: 'comprador',
        interessado_id: 'lead-1',
        texto: 'Mensagem sem relacionamento pré-existente',
        envio_id: envioId,
      }), { params: { id: 'lead-1' } })

      const body = await response.json()
      expect(response.status).toBe(200)
      expect(body.ok).toBe(true)
      expect(body.relacionamento_id).toBe('comrel-novo-1')
    })

    it('segunda chamada com o mesmo envio_id não reprocessa (idempotência própria)', async () => {
      const { POST } = await import('../route')
      const envioId = 'envio-duplicado-' + Date.now()

      const r1 = await POST(montarRequest({
        tipo_interessado: 'comprador',
        interessado_id: 'lead-1',
        texto: 'Mensagem original',
        envio_id: envioId,
      }), { params: { id: 'lead-1' } })
      expect((await r1.json()).ok).toBe(true)

      const chamadasAntes = fetchMock.mock.calls.length

      const r2 = await POST(montarRequest({
        tipo_interessado: 'comprador',
        interessado_id: 'lead-1',
        texto: 'Mensagem original',
        envio_id: envioId,
      }), { params: { id: 'lead-1' } })
      const body2 = await r2.json()

      expect(body2).toEqual({ ok: true, duplicado: true })
      // Nenhuma nova chamada à Uazapi na segunda tentativa.
      expect(fetchMock.mock.calls.length).toBe(chamadasAntes)
    })

    it('lead sem telefone cadastrado retorna 422', async () => {
      fakeState.leadTelefone = null
      const { POST } = await import('../route')

      const response = await POST(montarRequest({
        tipo_interessado: 'comprador',
        interessado_id: 'lead-1',
        texto: 'oi',
        envio_id: 'envio-sem-telefone-' + Date.now(),
      }), { params: { id: 'lead-1' } })

      expect(response.status).toBe(422)
    })

    it('interessado_id diferente do leadId retorna 422 (nunca confia no client)', async () => {
      const { POST } = await import('../route')

      const response = await POST(montarRequest({
        tipo_interessado: 'comprador',
        interessado_id: 'outro-lead-qualquer',
        texto: 'oi',
        envio_id: 'envio-interessado-invalido-' + Date.now(),
      }), { params: { id: 'lead-1' } })

      expect(response.status).toBe(422)
    })

    it('lead não encontrado (ou de outra empresa) retorna 404', async () => {
      fakeState.leadExiste = false
      const { POST } = await import('../route')

      const response = await POST(montarRequest({
        tipo_interessado: 'comprador',
        interessado_id: 'lead-inexistente',
        texto: 'oi',
        envio_id: 'envio-lead-inexistente-' + Date.now(),
      }), { params: { id: 'lead-inexistente' } })

      expect(response.status).toBe(404)
    })
  })

  describe('tipo_interessado=corretor', () => {
    it('corretor vinculado ao Lead: resolve nome/telefone no servidor e envia', async () => {
      const { POST } = await import('../route')

      const response = await POST(montarRequest({
        tipo_interessado: 'corretor',
        interessado_id: 'corretor-1',
        texto: 'Olá, corretor!',
        envio_id: 'envio-corretor-' + Date.now(),
      }), { params: { id: 'lead-1' } })

      const body = await response.json()
      expect(response.status).toBe(200)
      expect(body.ok).toBe(true)
      expect(body.destinatario_nome).toBe('Corretor Teste')
    })

    it('corretor não vinculado a este Lead retorna 404', async () => {
      fakeState.corretorVinculoExiste = false
      const { POST } = await import('../route')

      const response = await POST(montarRequest({
        tipo_interessado: 'corretor',
        interessado_id: 'corretor-de-outro-lead',
        texto: 'oi',
        envio_id: 'envio-corretor-invalido-' + Date.now(),
      }), { params: { id: 'lead-1' } })

      expect(response.status).toBe(404)
    })

    it('corretor inativo retorna 422', async () => {
      fakeState.corretorAtivo = false
      const { POST } = await import('../route')

      const response = await POST(montarRequest({
        tipo_interessado: 'corretor',
        interessado_id: 'corretor-1',
        texto: 'oi',
        envio_id: 'envio-corretor-inativo-' + Date.now(),
      }), { params: { id: 'lead-1' } })

      expect(response.status).toBe(422)
    })

    it('corretor sem telefone cadastrado retorna 422', async () => {
      fakeState.corretorTelefone = null
      const { POST } = await import('../route')

      const response = await POST(montarRequest({
        tipo_interessado: 'corretor',
        interessado_id: 'corretor-1',
        texto: 'oi',
        envio_id: 'envio-corretor-sem-telefone-' + Date.now(),
      }), { params: { id: 'lead-1' } })

      expect(response.status).toBe(422)
    })
  })

  it('tipo_interessado inválido retorna 422', async () => {
    const { POST } = await import('../route')
    const response = await POST(montarRequest({
      tipo_interessado: 'vendedor',
      interessado_id: 'lead-1',
      texto: 'oi',
      envio_id: 'envio-tipo-invalido-' + Date.now(),
    }), { params: { id: 'lead-1' } })
    expect(response.status).toBe(422)
  })

  it('exige tipo_interessado, interessado_id, texto e envio_id', async () => {
    const { POST } = await import('../route')
    const response = await POST(montarRequest({ texto: 'oi' }), { params: { id: 'lead-1' } })
    expect(response.status).toBe(422)
  })
})
