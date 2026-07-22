import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHash } from 'crypto'

const fakeState = {
  contrato: null as null | {
    id: string
    empresa_id: string
    clicksign_status: string | null
    clicksign_document_id: string | null
    clicksign_envelope_id: string | null
    clicksign_signed_url: string | null
  },
}

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: () => {
      const proxy: Record<string, unknown> = {}
      Object.assign(proxy, {
        select: () => proxy,
        eq: () => proxy,
        maybeSingle: async () => ({ data: fakeState.contrato, error: null }),
      })
      return proxy
    },
  },
}))

const processarFechamentoMock = vi.fn((..._args: any[]) =>
  Promise.resolve({ status: 'closed', signed_url: 'https://x.pdf', idempotente: false }),
)
vi.mock('@/lib/clicksign/processarFechamento', () => ({
  processarFechamentoContratoClicksign: processarFechamentoMock,
}))

function assinar(rawBody: string, secret: string): string {
  return 'sha256=' + createHash('sha256').update(rawBody + secret, 'utf8').digest('hex')
}

function montarRequest(rawBody: string, headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/clicksign/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: rawBody,
  }) as unknown as import('next/server').NextRequest
}

const payloadClose = JSON.stringify({
  event: { name: 'close', data: { document: { id: 'document-1' } } },
})

describe('POST /api/clicksign/webhook', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    delete process.env.CLICKSIGN_WEBHOOK_SECRET
    fakeState.contrato = {
      id: 'contrato-1',
      empresa_id: 'empresa-1',
      clicksign_status: 'running',
      clicksign_document_id: 'document-1',
      clicksign_envelope_id: 'envelope-1',
      clicksign_signed_url: null,
    }
    processarFechamentoMock.mockClear()
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('modo transitório (sem secret configurada): aceita sem validar assinatura e avisa nos logs', async () => {
    const { POST } = await import('../webhook/route')

    const response = await POST(montarRequest(payloadClose))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ ok: true })
    expect(processarFechamentoMock).toHaveBeenCalledTimes(1)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('CLICKSIGN_WEBHOOK_SECRET não configurada'))
  })

  it('fail-closed: com secret configurada, sem header Content-Hmac retorna 401 e não processa', async () => {
    process.env.CLICKSIGN_WEBHOOK_SECRET = 'segredo-real'
    const { POST } = await import('../webhook/route')

    const response = await POST(montarRequest(payloadClose))
    expect(response.status).toBe(401)
    expect(processarFechamentoMock).not.toHaveBeenCalled()
  })

  it('fail-closed: com secret configurada, assinatura inválida retorna 401 e não processa', async () => {
    process.env.CLICKSIGN_WEBHOOK_SECRET = 'segredo-real'
    const { POST } = await import('../webhook/route')

    const response = await POST(montarRequest(payloadClose, { 'content-hmac': 'sha256=' + '0'.repeat(64) }))
    expect(response.status).toBe(401)
    expect(processarFechamentoMock).not.toHaveBeenCalled()
  })

  it('fail-closed: com secret configurada e assinatura válida, processa normalmente', async () => {
    process.env.CLICKSIGN_WEBHOOK_SECRET = 'segredo-real'
    const { POST } = await import('../webhook/route')

    const assinatura = assinar(payloadClose, 'segredo-real')
    const response = await POST(montarRequest(payloadClose, { 'content-hmac': assinatura }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ ok: true })
    expect(processarFechamentoMock).toHaveBeenCalledTimes(1)
  })

  it('evento fora da allowlist não é processado (mesmo com assinatura válida)', async () => {
    process.env.CLICKSIGN_WEBHOOK_SECRET = 'segredo-real'
    const { POST } = await import('../webhook/route')

    const payload = JSON.stringify({ event: { name: 'upload', data: { document: { id: 'document-1' } } } })
    const assinatura = assinar(payload, 'segredo-real')
    const response = await POST(montarRequest(payload, { 'content-hmac': assinatura }))

    expect(response.status).toBe(200)
    expect(processarFechamentoMock).not.toHaveBeenCalled()
  })

  it('payload sem document/envelope não é processado', async () => {
    const payload = JSON.stringify({ event: { name: 'close' } })
    const { POST } = await import('../webhook/route')

    const response = await POST(montarRequest(payload))
    expect(response.status).toBe(200)
    expect(processarFechamentoMock).not.toHaveBeenCalled()
  })

  it('contrato não encontrado não é processado', async () => {
    fakeState.contrato = null
    const { POST } = await import('../webhook/route')

    const response = await POST(montarRequest(payloadClose))
    expect(response.status).toBe(200)
    expect(processarFechamentoMock).not.toHaveBeenCalled()
  })

  it('JSON malformado não derruba a rota — responde 200 sem processar', async () => {
    const { POST } = await import('../webhook/route')

    const response = await POST(montarRequest('{ isso não é json'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ ok: true })
    expect(processarFechamentoMock).not.toHaveBeenCalled()
  })

  it('assinatura válida com JSON inválido: não processa e não vaza detalhe do corpo', async () => {
    process.env.CLICKSIGN_WEBHOOK_SECRET = 'segredo-real'
    const corpoInvalido = '{ isso não é json'
    const assinatura = assinar(corpoInvalido, 'segredo-real')
    const { POST } = await import('../webhook/route')

    const response = await POST(montarRequest(corpoInvalido, { 'content-hmac': assinatura }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ ok: true })
    expect(processarFechamentoMock).not.toHaveBeenCalled()
  })

  it('nenhum log registra o payload/corpo completo da requisição', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { POST } = await import('../webhook/route')

    await POST(montarRequest(payloadClose))

    const todasChamadas = [...logSpy.mock.calls, ...warnSpy.mock.calls, ...errorSpy.mock.calls]
      .flat()
      .map((arg) => String(arg))
    const contemPayloadCompleto = todasChamadas.some((texto) => texto.includes(payloadClose))
    expect(contemPayloadCompleto).toBe(false)
  })
})
