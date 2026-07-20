import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Estado mutável lido em tempo de chamada (não na criação do client) — createClient() só é
// invocado uma vez no import top-level da rota, então os testes ajustam este objeto no
// beforeEach/dentro do it, e os closures do fake (capturados por referência) enxergam a
// mudança nas chamadas seguintes.
const fakeState = {
  processoExiste: true,
  compradorExiste: true,
  compradorTelefone: '5511900000000' as string | null,
  relacionamentoExiste: true,
  corretorVinculoExiste: true,
  corretorAtivo: true,
  corretorTelefone: '5511988887777' as string | null,
  parceiroVinculoExiste: true,
  parceiroAtivo: true,
  parceiroTelefone: '5511977776666' as string | null,
  imobiliariaVinculoExiste: true,
  imobiliariaAtivo: true,
  imobiliariaTelefone: '5511966665555' as string | null,
}

// Fake de supabase cobrindo as tabelas usadas pelo endpoint: usuarios, processos,
// processo_compradores, processo_corretores (join corretores), processo_parceiros (join
// parceiros), processo_imobiliarias (join imobiliarias), comunicacao_relacionamentos,
// mensagens_processos (com UNIQUE(envio_id) simulado), conversas, instancias, mensagens,
// processo_comentarios.
function criarFakeSupabase() {
  const envioIds = new Set<string>()
  const escritas: Array<{ tabela: string; metodo: string; valores?: unknown }> = []

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
          if (tabela === 'comunicacao_relacionamentos') {
            return {
              select: () => ({
                single: async () => ({ data: { id: 'comrel-novo-1' }, error: null }),
              }),
            }
          }
          escritas.push({ tabela, metodo: 'insert', valores })
          return proxy
        },
        maybeSingle: async () => {
          if (tabela === 'comunicacao_relacionamentos') {
            return fakeState.relacionamentoExiste ? { data: { id: 'comrel-1' }, error: null } : { data: null, error: null }
          }
          if (tabela === 'processo_compradores') {
            if (!fakeState.compradorExiste) return { data: null, error: null }
            return {
              data: { id: 'comprador-1', nome: 'Comprador Teste', telefone: fakeState.compradorTelefone, pessoa_id: null },
              error: null,
            }
          }
          if (tabela === 'processo_corretores') {
            if (!fakeState.corretorVinculoExiste) return { data: null, error: null }
            return {
              data: {
                id: 'processo-corretor-1',
                corretor: { id: 'corretor-1', nome: 'Corretor Teste', telefone: fakeState.corretorTelefone, ativo: fakeState.corretorAtivo },
              },
              error: null,
            }
          }
          if (tabela === 'processo_parceiros') {
            if (!fakeState.parceiroVinculoExiste) return { data: null, error: null }
            return {
              data: {
                id: 'processo-parceiro-1',
                parceiro: { id: 'parceiro-1', nome: 'Parceiro Teste', telefone: fakeState.parceiroTelefone, ativo: fakeState.parceiroAtivo },
              },
              error: null,
            }
          }
          if (tabela === 'processo_imobiliarias') {
            if (!fakeState.imobiliariaVinculoExiste) return { data: null, error: null }
            return {
              data: {
                id: 'processo-imobiliaria-1',
                imobiliaria: { id: 'imobiliaria-1', nome: 'Imobiliária Teste', telefone: fakeState.imobiliariaTelefone, ativo: fakeState.imobiliariaAtivo },
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
          if (tabela === 'processos') {
            if (!fakeState.processoExiste) return { data: null, error: null }
            return { data: { id: 'processo-1', empresa_id: 'empresa-1', lead_id: null }, error: null }
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

  return { client, escritas }
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
    fakeState.processoExiste = true
    fakeState.compradorExiste = true
    fakeState.compradorTelefone = '5511900000000'
    fakeState.relacionamentoExiste = true
    fakeState.corretorVinculoExiste = true
    fakeState.corretorAtivo = true
    fakeState.corretorTelefone = '5511988887777'
    fakeState.parceiroVinculoExiste = true
    fakeState.parceiroAtivo = true
    fakeState.parceiroTelefone = '5511977776666'
    fakeState.imobiliariaVinculoExiste = true
    fakeState.imobiliariaAtivo = true
    fakeState.imobiliariaTelefone = '5511966665555'
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
    it('relacionamento já existe: resolve/cria conversa, envia e registra no histórico do Negócio', async () => {
      const { POST } = await import('../route')
      const envioId = 'envio-' + Date.now()

      const response = await POST(montarRequest({
        tipo_interessado: 'comprador',
        interessado_id: 'comprador-1',
        texto: 'Olá, atualização do seu negócio!',
        envio_id: envioId,
      }), { params: { id: 'processo-1' } })

      const body = await response.json()
      expect(response.status).toBe(200)
      expect(body.ok).toBe(true)
      expect(body.mensagem_id).toBe('mensagem-db-1')
      expect(body.relacionamento_id).toBe('comrel-1')
      expect(body.destinatario_nome).toBe('Comprador Teste')
    })

    it('relacionamento ausente (caminho defensivo): cria e o envio prossegue normalmente', async () => {
      fakeState.relacionamentoExiste = false
      const { POST } = await import('../route')
      const envioId = 'envio-comrel-' + Date.now()

      const response = await POST(montarRequest({
        tipo_interessado: 'comprador',
        interessado_id: 'comprador-1',
        texto: 'Mensagem sem relacionamento pré-existente',
        envio_id: envioId,
      }), { params: { id: 'processo-1' } })

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
        interessado_id: 'comprador-1',
        texto: 'Mensagem original',
        envio_id: envioId,
      }), { params: { id: 'processo-1' } })
      expect((await r1.json()).ok).toBe(true)

      const chamadasAntes = fetchMock.mock.calls.length

      const r2 = await POST(montarRequest({
        tipo_interessado: 'comprador',
        interessado_id: 'comprador-1',
        texto: 'Mensagem original',
        envio_id: envioId,
      }), { params: { id: 'processo-1' } })
      const body2 = await r2.json()

      expect(body2).toEqual({ ok: true, duplicado: true })
      expect(fetchMock.mock.calls.length).toBe(chamadasAntes)
    })

    it('comprador sem telefone cadastrado retorna 422', async () => {
      fakeState.compradorTelefone = null
      const { POST } = await import('../route')

      const response = await POST(montarRequest({
        tipo_interessado: 'comprador',
        interessado_id: 'comprador-1',
        texto: 'oi',
        envio_id: 'envio-sem-telefone-' + Date.now(),
      }), { params: { id: 'processo-1' } })

      expect(response.status).toBe(422)
    })

    it('comprador não encontrado (ou de outro Negócio) retorna 404', async () => {
      fakeState.compradorExiste = false
      const { POST } = await import('../route')

      const response = await POST(montarRequest({
        tipo_interessado: 'comprador',
        interessado_id: 'comprador-inexistente',
        texto: 'oi',
        envio_id: 'envio-comprador-inexistente-' + Date.now(),
      }), { params: { id: 'processo-1' } })

      expect(response.status).toBe(404)
    })

    it('Negócio não encontrado (ou de outra empresa) retorna 404', async () => {
      fakeState.processoExiste = false
      const { POST } = await import('../route')

      const response = await POST(montarRequest({
        tipo_interessado: 'comprador',
        interessado_id: 'comprador-1',
        texto: 'oi',
        envio_id: 'envio-processo-inexistente-' + Date.now(),
      }), { params: { id: 'processo-inexistente' } })

      expect(response.status).toBe(404)
    })
  })

  describe('tipo_interessado=corretor', () => {
    it('corretor vinculado ao Negócio: resolve nome/telefone no servidor e envia', async () => {
      const { POST } = await import('../route')

      const response = await POST(montarRequest({
        tipo_interessado: 'corretor',
        interessado_id: 'corretor-1',
        texto: 'Olá, corretor!',
        envio_id: 'envio-corretor-' + Date.now(),
      }), { params: { id: 'processo-1' } })

      const body = await response.json()
      expect(response.status).toBe(200)
      expect(body.ok).toBe(true)
      expect(body.destinatario_nome).toBe('Corretor Teste')
    })

    it('corretor não vinculado a este Negócio retorna 404', async () => {
      fakeState.corretorVinculoExiste = false
      const { POST } = await import('../route')

      const response = await POST(montarRequest({
        tipo_interessado: 'corretor',
        interessado_id: 'corretor-de-outro-processo',
        texto: 'oi',
        envio_id: 'envio-corretor-invalido-' + Date.now(),
      }), { params: { id: 'processo-1' } })

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
      }), { params: { id: 'processo-1' } })

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
      }), { params: { id: 'processo-1' } })

      expect(response.status).toBe(422)
    })
  })

  describe('tipo_interessado=parceiro', () => {
    it('parceiro vinculado ao Negócio: resolve nome/telefone no servidor e envia', async () => {
      const { POST } = await import('../route')

      const response = await POST(montarRequest({
        tipo_interessado: 'parceiro',
        interessado_id: 'parceiro-1',
        texto: 'Olá, parceiro!',
        envio_id: 'envio-parceiro-' + Date.now(),
      }), { params: { id: 'processo-1' } })

      const body = await response.json()
      expect(response.status).toBe(200)
      expect(body.ok).toBe(true)
      expect(body.destinatario_nome).toBe('Parceiro Teste')
    })

    it('parceiro não vinculado a este Negócio retorna 404', async () => {
      fakeState.parceiroVinculoExiste = false
      const { POST } = await import('../route')

      const response = await POST(montarRequest({
        tipo_interessado: 'parceiro',
        interessado_id: 'parceiro-de-outro-processo',
        texto: 'oi',
        envio_id: 'envio-parceiro-invalido-' + Date.now(),
      }), { params: { id: 'processo-1' } })

      expect(response.status).toBe(404)
    })

    it('parceiro inativo retorna 422', async () => {
      fakeState.parceiroAtivo = false
      const { POST } = await import('../route')

      const response = await POST(montarRequest({
        tipo_interessado: 'parceiro',
        interessado_id: 'parceiro-1',
        texto: 'oi',
        envio_id: 'envio-parceiro-inativo-' + Date.now(),
      }), { params: { id: 'processo-1' } })

      expect(response.status).toBe(422)
    })

    it('parceiro sem telefone cadastrado retorna 422', async () => {
      fakeState.parceiroTelefone = null
      const { POST } = await import('../route')

      const response = await POST(montarRequest({
        tipo_interessado: 'parceiro',
        interessado_id: 'parceiro-1',
        texto: 'oi',
        envio_id: 'envio-parceiro-sem-telefone-' + Date.now(),
      }), { params: { id: 'processo-1' } })

      expect(response.status).toBe(422)
    })
  })

  describe('tipo_interessado=imobiliaria|construtora', () => {
    it('imobiliária vinculada ao Negócio: resolve nome/telefone no servidor e envia', async () => {
      const { POST } = await import('../route')

      const response = await POST(montarRequest({
        tipo_interessado: 'imobiliaria',
        interessado_id: 'imobiliaria-1',
        texto: 'Olá, imobiliária!',
        envio_id: 'envio-imobiliaria-' + Date.now(),
      }), { params: { id: 'processo-1' } })

      const body = await response.json()
      expect(response.status).toBe(200)
      expect(body.ok).toBe(true)
      expect(body.destinatario_nome).toBe('Imobiliária Teste')
    })

    it('construtora vinculada ao Negócio: resolve nome/telefone no servidor e envia', async () => {
      const { POST } = await import('../route')

      const response = await POST(montarRequest({
        tipo_interessado: 'construtora',
        interessado_id: 'imobiliaria-1',
        texto: 'Olá, construtora!',
        envio_id: 'envio-construtora-' + Date.now(),
      }), { params: { id: 'processo-1' } })

      const body = await response.json()
      expect(response.status).toBe(200)
      expect(body.ok).toBe(true)
      expect(body.destinatario_nome).toBe('Imobiliária Teste')
    })

    it('imobiliária/construtora não vinculada a este Negócio retorna 404', async () => {
      fakeState.imobiliariaVinculoExiste = false
      const { POST } = await import('../route')

      const response = await POST(montarRequest({
        tipo_interessado: 'imobiliaria',
        interessado_id: 'imobiliaria-de-outro-processo',
        texto: 'oi',
        envio_id: 'envio-imobiliaria-invalida-' + Date.now(),
      }), { params: { id: 'processo-1' } })

      expect(response.status).toBe(404)
    })

    it('imobiliária inativa retorna 422', async () => {
      fakeState.imobiliariaAtivo = false
      const { POST } = await import('../route')

      const response = await POST(montarRequest({
        tipo_interessado: 'imobiliaria',
        interessado_id: 'imobiliaria-1',
        texto: 'oi',
        envio_id: 'envio-imobiliaria-inativa-' + Date.now(),
      }), { params: { id: 'processo-1' } })

      expect(response.status).toBe(422)
    })

    it('imobiliária sem telefone cadastrado retorna 422', async () => {
      fakeState.imobiliariaTelefone = null
      const { POST } = await import('../route')

      const response = await POST(montarRequest({
        tipo_interessado: 'imobiliaria',
        interessado_id: 'imobiliaria-1',
        texto: 'oi',
        envio_id: 'envio-imobiliaria-sem-telefone-' + Date.now(),
      }), { params: { id: 'processo-1' } })

      expect(response.status).toBe(422)
    })
  })

  it('tipo_interessado inválido retorna 422', async () => {
    const { POST } = await import('../route')
    const response = await POST(montarRequest({
      tipo_interessado: 'vendedor',
      interessado_id: 'comprador-1',
      texto: 'oi',
      envio_id: 'envio-tipo-invalido-' + Date.now(),
    }), { params: { id: 'processo-1' } })
    expect(response.status).toBe(422)
  })

  it('exige tipo_interessado, interessado_id, texto e envio_id', async () => {
    const { POST } = await import('../route')
    const response = await POST(montarRequest({ texto: 'oi' }), { params: { id: 'processo-1' } })
    expect(response.status).toBe(422)
  })
})
