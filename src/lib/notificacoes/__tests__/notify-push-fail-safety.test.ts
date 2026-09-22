/**
 * NotificationService.notify() continua a única porta de entrada — quem chama não
 * precisa saber nada de Web Push. Requisito crítico do plano de push (2026-09-22):
 * falha de push (VAPID mal configurado, subscription inválida, erro de rede) NUNCA
 * pode fazer notify() rejeitar — a notificação já foi gravada em `notificacoes`
 * (fonte de verdade) antes do push sequer ser tentado.
 *
 * Também cobre a regressão real de produção (2026-09-22): sem `viaServiceRole`, a
 * RPC `criar_notificacao` sempre rejeitava chamadas de webhook/service-role com
 * "Sem permissão para notificar este usuário" (ela exige auth.uid(), que é sempre
 * NULL numa chamada de service role) — o push de nova mensagem nunca disparava.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))

const enviarPushMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/push/enviarPush', () => ({ enviarPushParaUsuario: enviarPushMock }))

function criarSupabaseMockRpc(rpcResultado: { data: unknown; error: unknown }) {
  return { rpc: vi.fn().mockResolvedValue(rpcResultado) } as unknown as import('@supabase/supabase-js').SupabaseClient
}

interface ChamadaInsert { tabela: string; valores: unknown }

function criarSupabaseMockServiceRole(usuario: { empresa_id: string } | null, idInserido: string | null) {
  const chamadas: ChamadaInsert[] = []
  const client = {
    from: (tabela: string) => {
      if (tabela === 'usuarios') {
        const q: Record<string, unknown> = {}
        q.select = () => q
        q.eq = () => q
        q.maybeSingle = () => Promise.resolve({ data: usuario, error: null })
        return q
      }
      if (tabela === 'notificacoes') {
        const q: Record<string, unknown> = {}
        q.insert = (valores: unknown) => { chamadas.push({ tabela, valores }); return q }
        q.select = () => q
        q.single = () => Promise.resolve(idInserido ? { data: { id: idInserido }, error: null } : { data: null, error: new Error('insert falhou') })
        return q
      }
      throw new Error(`tabela inesperada: ${tabela}`)
    },
  }
  return { client: client as unknown as import('@supabase/supabase-js').SupabaseClient, chamadas }
}

describe('NotificationService.notify — push é efeito colateral, nunca crítico', () => {
  it('push falhando (rejeita) não impede notify() de retornar sucesso', async () => {
    enviarPushMock.mockRejectedValue(new Error('VAPID mal configurado'))
    const { notify } = await import('../notificationService')
    const supabase = criarSupabaseMockRpc({ data: 'notif-1', error: null })

    const resultado = await notify(
      { usuarioId: 'u1', tipo: 'mensagem_whatsapp', titulo: 'Nova mensagem de João', mensagem: 'Nova mensagem de João' },
      supabase,
    )

    expect(resultado).toEqual({ id: 'notif-1', error: null })
  })

  it('notificação insere via RPC normalmente mesmo sem nenhuma subscription/push configurado', async () => {
    enviarPushMock.mockResolvedValue(undefined)
    const { notify } = await import('../notificationService')
    const supabase = criarSupabaseMockRpc({ data: 'notif-2', error: null })

    const resultado = await notify({ usuarioId: 'u1', tipo: 'mensagem_whatsapp', titulo: 'x' }, supabase)

    expect(resultado.id).toBe('notif-2')
    expect(enviarPushMock).toHaveBeenCalledWith(supabase, 'u1', expect.objectContaining({ titulo: 'Fonti' }))
  })

  it('erro na RPC (falha real de criação): não tenta push, retorna erro (comportamento existente preservado)', async () => {
    enviarPushMock.mockClear()
    const { notify } = await import('../notificationService')
    const erro = new Error('RPC falhou')
    const supabase = criarSupabaseMockRpc({ data: null, error: erro })

    const resultado = await notify({ usuarioId: 'u1', tipo: 'mensagem_whatsapp', titulo: 'x' }, supabase)

    expect(resultado).toEqual({ id: null, error: erro })
    expect(enviarPushMock).not.toHaveBeenCalled()
  })

  it('push usa título fixo "Fonti" (nunca o titulo do sino) e o corpo com a mensagem dada pelo chamador', async () => {
    enviarPushMock.mockResolvedValue(undefined)
    const { notify } = await import('../notificationService')
    const supabase = criarSupabaseMockRpc({ data: 'notif-3', error: null })

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

  describe('viaServiceRole (webhook/cron sem sessão de usuário)', () => {
    it('insere direto em `notificacoes` (nunca via RPC) e dispara o push normalmente', async () => {
      enviarPushMock.mockResolvedValue(undefined)
      const { notify } = await import('../notificationService')
      const { client, chamadas } = criarSupabaseMockServiceRole({ empresa_id: 'empresa-1' }, 'notif-sr-1')

      const resultado = await notify(
        {
          usuarioId: 'atendente-1', tipo: 'mensagem_whatsapp',
          titulo: 'Nova mensagem de Marcio', mensagem: 'Nova mensagem de Marcio',
          entidade: 'conversa', entidadeId: 'conversa-9', viaServiceRole: true,
        },
        client,
      )

      expect(resultado).toEqual({ id: 'notif-sr-1', error: null })
      expect(chamadas).toHaveLength(1)
      expect(chamadas[0].valores).toEqual(expect.objectContaining({
        empresa_id: 'empresa-1', usuario_id: 'atendente-1', tipo: 'mensagem_whatsapp',
      }))
      expect(enviarPushMock).toHaveBeenCalledWith(client, 'atendente-1', expect.objectContaining({ titulo: 'Fonti' }))
    })

    it('usuário destinatário inexistente/inativo: retorna erro, não insere, não tenta push', async () => {
      enviarPushMock.mockClear()
      const { notify } = await import('../notificationService')
      const { client, chamadas } = criarSupabaseMockServiceRole(null, null)

      const resultado = await notify(
        { usuarioId: 'usuario-inexistente', tipo: 'mensagem_whatsapp', titulo: 'x', viaServiceRole: true },
        client,
      )

      expect(resultado.id).toBeNull()
      expect(resultado.error).toBeInstanceOf(Error)
      expect(chamadas).toHaveLength(0)
      expect(enviarPushMock).not.toHaveBeenCalled()
    })
  })
})
