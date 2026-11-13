import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// O token é lido quando o módulo carrega — precisa existir antes do import.
vi.hoisted(() => { process.env.INSTAGRAM_PAGE_ACCESS_TOKEN = 'token-teste' })

import { enviarMensagemInstagram, MENSAGEM_JANELA_FECHADA } from '../enviarMensagemInstagram'

function supabaseFake() {
  const encadeado = {
    insert: () => encadeado,
    select: () => encadeado,
    single: async () => ({ data: { id: 'msg-1' } }),
    update: () => encadeado,
    eq: async () => ({}),
  }
  return { from: () => encadeado } as never
}

const foraDaJanela = () => new Response(JSON.stringify({
  error: { message: 'This message is sent outside of allowed window.', code: 10, error_subcode: 2534022 },
}), { status: 403 })

const params = () => ({
  supabase: supabaseFake(),
  conversaId: 'c1',
  destinatarioId: 'ig-1',
  texto: 'oi',
  usuarioId: 'u1',
  usuarioNome: 'Marcio',
})

describe('enviarMensagemInstagram', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('envia sem tag dentro da janela de 24h', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ message_id: 'm1' })))
    const r = await enviarMensagemInstagram(params())
    expect(r).toMatchObject({ ok: true, messageId: 'm1' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).tag).toBeUndefined()
  })

  it('fora da janela, tenta de novo com a tag HUMAN_AGENT', async () => {
    fetchMock
      .mockResolvedValueOnce(foraDaJanela())
      .mockResolvedValueOnce(new Response(JSON.stringify({ message_id: 'm2' })))
    const r = await enviarMensagemInstagram(params())
    expect(r).toMatchObject({ ok: true, messageId: 'm2' })
    const corpo = JSON.parse(fetchMock.mock.calls[1][1].body)
    expect(corpo).toMatchObject({ messaging_type: 'MESSAGE_TAG', tag: 'HUMAN_AGENT' })
  })

  it('fora da janela e sem Human Agent aprovado, explica a regra das 24h', async () => {
    fetchMock.mockResolvedValueOnce(foraDaJanela()).mockResolvedValueOnce(foraDaJanela())
    const r = await enviarMensagemInstagram(params())
    expect(r).toEqual({ ok: false, status: 422, error: MENSAGEM_JANELA_FECHADA })
  })

  it('outros erros continuam genéricos e não tentam de novo', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{"error":{"code":190}}', { status: 401 }))
    const r = await enviarMensagemInstagram(params())
    expect(r).toMatchObject({ ok: false, status: 502 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
