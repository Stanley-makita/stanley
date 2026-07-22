import { describe, it, expect, vi, beforeEach } from 'vitest'

const fakeState = {
  autenticado: true,
  empresaId: 'empresa-1',
  contrato: null as null | {
    id: string
    empresa_id: string
    clicksign_status: string | null
    clicksign_document_id: string | null
    clicksign_envelope_id: string | null
    clicksign_signed_url: string | null
  },
  envelopeStatus: 'closed' as string,
}

const getUserMock = vi.fn(async () =>
  fakeState.autenticado
    ? { data: { user: { id: 'auth-user-1' } }, error: null }
    : { data: { user: null }, error: null },
)

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: getUserMock } })),
}))

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: (tabela: string) => {
      const proxy: Record<string, unknown> = {}
      Object.assign(proxy, {
        select: () => proxy,
        or: () => proxy,
        eq: () => proxy,
        single: async () => {
          if (tabela === 'usuarios') return { data: { empresa_id: fakeState.empresaId }, error: null }
          return { data: null, error: null }
        },
        maybeSingle: async () => {
          if (tabela === 'processo_contratos') return { data: fakeState.contrato, error: null }
          return { data: null, error: null }
        },
      })
      return proxy
    },
  },
}))

const buscarEnvelopeMock = vi.fn((..._args: any[]) => Promise.resolve({ status: fakeState.envelopeStatus }))
vi.mock('@/lib/clicksign/client', () => ({
  buscarEnvelope: buscarEnvelopeMock,
}))

const processarFechamentoMock = vi.fn((..._args: any[]) =>
  Promise.resolve({ status: 'closed', signed_url: 'https://x.pdf', idempotente: false }),
)
vi.mock('@/lib/clicksign/processarFechamento', () => ({
  processarFechamentoContratoClicksign: processarFechamentoMock,
}))

function montarRequest(body: unknown) {
  return new Request('http://localhost/api/clicksign/atualizar-status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as import('next/server').NextRequest
}

describe('POST /api/clicksign/atualizar-status', () => {
  beforeEach(() => {
    fakeState.autenticado = true
    fakeState.empresaId = 'empresa-1'
    fakeState.contrato = {
      id: 'contrato-1',
      empresa_id: 'empresa-1',
      clicksign_status: 'running',
      clicksign_document_id: 'document-1',
      clicksign_envelope_id: 'envelope-1',
      clicksign_signed_url: null,
    }
    fakeState.envelopeStatus = 'closed'
    getUserMock.mockClear()
    buscarEnvelopeMock.mockClear()
    processarFechamentoMock.mockClear()
  })

  it('401 sem sessão', async () => {
    fakeState.autenticado = false
    const { POST } = await import('../atualizar-status/route')

    const response = await POST(montarRequest({ processo_contrato_id: 'contrato-1' }))
    expect(response.status).toBe(401)
    expect(processarFechamentoMock).not.toHaveBeenCalled()
  })

  it('404 para contrato inexistente ou de outra empresa', async () => {
    fakeState.contrato = null
    const { POST } = await import('../atualizar-status/route')

    const response = await POST(montarRequest({ processo_contrato_id: 'contrato-1' }))
    expect(response.status).toBe(404)
    expect(processarFechamentoMock).not.toHaveBeenCalled()
  })

  it('não delega à função comum quando o envelope ainda não está fechado na ClickSign', async () => {
    fakeState.envelopeStatus = 'running'
    const { POST } = await import('../atualizar-status/route')

    const response = await POST(montarRequest({ processo_contrato_id: 'contrato-1' }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ status: 'running' })
    expect(processarFechamentoMock).not.toHaveBeenCalled()
  })

  it('delega à função comum (processarFechamentoContratoClicksign) quando o envelope está fechado', async () => {
    const { POST } = await import('../atualizar-status/route')

    const response = await POST(montarRequest({ processo_contrato_id: 'contrato-1' }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ status: 'closed', signed_url: 'https://x.pdf' })
    expect(processarFechamentoMock).toHaveBeenCalledWith(
      expect.objectContaining({ origem: 'polling', evento: 'polling_verificacao', contrato: fakeState.contrato }),
    )
  })
})
