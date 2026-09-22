/**
 * NotificationService.notify() continua a única porta de entrada — quem chama não
 * precisa saber nada de Web Push. Requisito crítico do plano de push (2026-09-22):
 * falha de push (VAPID mal configurado, subscription inválida, erro de rede) NUNCA
 * pode fazer notify() rejeitar — a notificação já foi gravada em `notificacoes`
 * (fonte de verdade) antes do push sequer ser tentado.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))

const enviarPushMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/push/enviarPush', () => ({ enviarPushParaUsuario: enviarPushMock }))

function criarSupabaseMock(rpcResultado: { data: unknown; error: unknown }) {
  return { rpc: vi.fn().mockResolvedValue(rpcResultado) } as unknown as import('@supabase/supabase-js').SupabaseClient
}

describe('NotificationService.notify — push é efeito colateral, nunca crítico', () => {
  it('push falhando (rejeita) não impede notify() de retornar sucesso', async () => {
    enviarPushMock.mockRejectedValue(new Error('VAPID mal configurado'))
    const { notify } = await import('../notificationService')
    const supabase = criarSupabaseMock({ data: 'notif-1', error: null })

    const resultado = await notify(
      { usuarioId: 'u1', tipo: 'mensagem_whatsapp', titulo: 'Nova mensagem de João', mensagem: 'Nova mensagem de João' },
      supabase,
    )

    expect(resultado).toEqual({ id: 'notif-1', error: null })
  })

  it('notificação insere via RPC normalmente mesmo sem nenhuma subscription/push configurado', async () => {
    enviarPushMock.mockResolvedValue(undefined)
    const { notify } = await import('../notificationService')
    const supabase = criarSupabaseMock({ data: 'notif-2', error: null })

    const resultado = await notify({ usuarioId: 'u1', tipo: 'mensagem_whatsapp', titulo: 'x' }, supabase)

    expect(resultado.id).toBe('notif-2')
    expect(enviarPushMock).toHaveBeenCalledWith(supabase, 'u1', expect.objectContaining({ titulo: 'Fonti' }))
  })

  it('erro na RPC (falha real de criação): não tenta push, retorna erro (comportamento existente preservado)', async () => {
    enviarPushMock.mockClear()
    const { notify } = await import('../notificationService')
    const erro = new Error('RPC falhou')
    const supabase = criarSupabaseMock({ data: null, error: erro })

    const resultado = await notify({ usuarioId: 'u1', tipo: 'mensagem_whatsapp', titulo: 'x' }, supabase)

    expect(resultado).toEqual({ id: null, error: erro })
    expect(enviarPushMock).not.toHaveBeenCalled()
  })

  it('push usa título fixo "Fonti" (nunca o titulo do sino) e o corpo com a mensagem dada pelo chamador', async () => {
    enviarPushMock.mockResolvedValue(undefined)
    const { notify } = await import('../notificationService')
    const supabase = criarSupabaseMock({ data: 'notif-3', error: null })

    await notify(
      {
        usuarioId: 'u1', tipo: 'mensagem_whatsapp',
        titulo: 'Nova mensagem de Carlos Eduardo', mensagem: 'Nova mensagem de Carlos Eduardo',
        entidade: 'conversa', entidadeId: 'conversa-77',
      },
      supabase,
    )

    expect(enviarPushMock).toHaveBeenCalledWith(supabase, 'u1', {
      titulo: 'Fonti',
      corpo: 'Nova mensagem de Carlos Eduardo',
      url: '/conversas?id=conversa-77',
    })
  })
})
