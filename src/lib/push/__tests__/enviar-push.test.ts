/**
 * enviarPushParaUsuario: nunca lança exceção (VAPID mal configurado, erro de rede,
 * subscription inválida — nada disso pode voltar a afetar quem chamou), manda pra
 * TODAS as inscrições ativas do usuário (vários dispositivos), e desativa (sem
 * apagar) uma inscrição que o navegador devolveu como 404/410, sem afetar as demais.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const enviosMock = vi.hoisted(() => vi.fn())
vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: enviosMock,
  },
}))

function criarSupabaseMock(subs: Array<{ id: string; endpoint: string; p256dh: string; auth: string }>) {
  const updates: Array<{ id: string; valores: unknown }> = []
  const client = {
    from: (tabela: string) => {
      expect(tabela).toBe('push_subscriptions')
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.eq = () => q
      q.update = (valores: unknown) => {
        const chain: Record<string, unknown> = {}
        chain.eq = (_col: string, id: string) => { updates.push({ id, valores }); return Promise.resolve({ error: null }) }
        return chain
      }
      // .select().eq().eq() termina resolvendo (thenable) com os subs
      q.then = (resolve: (v: { data: unknown; error: null }) => unknown) => resolve({ data: subs, error: null })
      return q
    },
  }
  return { client, updates }
}

beforeEach(() => {
  enviosMock.mockReset()
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'chave-publica-teste'
  process.env.VAPID_PRIVATE_KEY = 'chave-privada-teste'
})

describe('enviarPushParaUsuario', () => {
  it('sem VAPID configurado: não lança, não tenta enviar', async () => {
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    delete process.env.VAPID_PRIVATE_KEY
    const { enviarPushParaUsuario } = await import('../enviarPush')
    const { client } = criarSupabaseMock([{ id: 's1', endpoint: 'e1', p256dh: 'p', auth: 'a' }])
    await expect(enviarPushParaUsuario(client as never, 'u1', { titulo: 'Fonti', corpo: 'oi' })).resolves.toBeUndefined()
    expect(enviosMock).not.toHaveBeenCalled()
  })

  it('sem inscrições ativas: não lança, não chama sendNotification', async () => {
    const { enviarPushParaUsuario } = await import('../enviarPush')
    const { client } = criarSupabaseMock([])
    await enviarPushParaUsuario(client as never, 'u1', { titulo: 'Fonti', corpo: 'oi' })
    expect(enviosMock).not.toHaveBeenCalled()
  })

  it('manda pra todas as inscrições ativas do usuário (vários dispositivos)', async () => {
    enviosMock.mockResolvedValue({})
    const { enviarPushParaUsuario } = await import('../enviarPush')
    const { client } = criarSupabaseMock([
      { id: 's1', endpoint: 'e1', p256dh: 'p1', auth: 'a1' },
      { id: 's2', endpoint: 'e2', p256dh: 'p2', auth: 'a2' },
    ])
    await enviarPushParaUsuario(client as never, 'u1', { titulo: 'Fonti', corpo: 'oi' })
    expect(enviosMock).toHaveBeenCalledTimes(2)
  })

  it('subscription expirada (410): desativa sem afetar as outras, nunca lança', async () => {
    enviosMock.mockImplementation((sub: { endpoint: string }) => {
      if (sub.endpoint === 'expirada') { const e = new Error('Gone') as Error & { statusCode: number }; e.statusCode = 410; return Promise.reject(e) }
      return Promise.resolve({})
    })
    const { enviarPushParaUsuario } = await import('../enviarPush')
    const { client, updates } = criarSupabaseMock([
      { id: 's-expirada', endpoint: 'expirada', p256dh: 'p', auth: 'a' },
      { id: 's-ok', endpoint: 'ok', p256dh: 'p', auth: 'a' },
    ])
    await expect(enviarPushParaUsuario(client as never, 'u1', { titulo: 'Fonti', corpo: 'oi' })).resolves.toBeUndefined()
    expect(updates.find((u) => u.id === 's-expirada')?.valores).toEqual({ ativo: false })
    expect(updates.find((u) => u.id === 's-ok')?.valores).toEqual(expect.objectContaining({ last_used_at: expect.any(String) }))
  })

  it('erro de rede genérico numa inscrição: só loga, não lança, não desativa', async () => {
    enviosMock.mockRejectedValue(new Error('ECONNRESET'))
    const { enviarPushParaUsuario } = await import('../enviarPush')
    const { client, updates } = criarSupabaseMock([{ id: 's1', endpoint: 'e1', p256dh: 'p', auth: 'a' }])
    await expect(enviarPushParaUsuario(client as never, 'u1', { titulo: 'Fonti', corpo: 'oi' })).resolves.toBeUndefined()
    expect(updates).toHaveLength(0)
  })
})
