import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const enviarPushParaUsuario = vi.fn(async () => {})
vi.mock('@/lib/push/enviarPush', () => ({ enviarPushParaUsuario: (...a: unknown[]) => enviarPushParaUsuario(...(a as [])) }))
vi.mock('@/lib/notificacoes/navegarNotificacao', () => ({ resolverRotaNotificacao: () => '/operacional' }))

type Notif = { id: string; usuario_id: string; titulo: string; mensagem: string | null; entidade: string; entidade_id: string; dados_json: Record<string, unknown> | null }

/** Mock mínimo: SELECT devolve as sem push_enviado; UPDATE condicional só "pega" se ainda não tiver. */
function criarSb(notifs: Notif[]) {
  const sb = {
    from: () => {
      let modo: 'select' | 'update' = 'select'
      let patch: Record<string, unknown> = {}
      let id = ''
      const q: Record<string, unknown> = {}
      q.select = () => {
        if (modo === 'update') {
          const n = notifs.find(x => x.id === id)!
          if (n.dados_json?.push_enviado) return Promise.resolve({ data: [], error: null })
          Object.assign(n, patch)
          return Promise.resolve({ data: [{ id }], error: null })
        }
        return q
      }
      q.update = (p: Record<string, unknown>) => { modo = 'update'; patch = p; return q }
      q.eq = (c: string, v: string) => { if (modo === 'update' && c === 'id') id = v; return q }
      q.gte = () => q
      q.is = () => (modo === 'select'
        ? Promise.resolve({ data: notifs.filter(n => !n.dados_json?.push_enviado).map(n => ({ ...n })), error: null })
        : q)
      return q
    },
  }
  return sb as unknown as SupabaseClient
}

describe('enviarPushNotificacoesSolicitacao', () => {
  beforeEach(() => enviarPushParaUsuario.mockClear())

  it('caso real: resposta do comercial → push para a operacional, com título e texto', async () => {
    const { enviarPushNotificacoesSolicitacao } = await import('../pushNotificacoes')
    const notifs: Notif[] = [{ id: 'n1', usuario_id: 'fabricia', titulo: 'Bruno Machado respondeu à solicitação',
      mensagem: 'Documentos anexados', entidade: 'solicitacao', entidade_id: 's1', dados_json: null }]
    expect(await enviarPushNotificacoesSolicitacao(criarSb(notifs), 's1')).toBe(1)
    expect(enviarPushParaUsuario).toHaveBeenCalledWith(expect.anything(), 'fabricia', expect.objectContaining({
      corpo: 'Bruno Machado respondeu à solicitação: Documentos anexados', url: '/operacional',
    }))
    expect(notifs[0].dados_json?.push_enviado).toBeTruthy()
  })

  it('segunda chamada não manda o mesmo push de novo', async () => {
    const { enviarPushNotificacoesSolicitacao } = await import('../pushNotificacoes')
    const notifs: Notif[] = [{ id: 'n1', usuario_id: 'u', titulo: 'T', mensagem: null, entidade: 'solicitacao', entidade_id: 's1', dados_json: { prioridade: 'x' } }]
    const sb = criarSb(notifs)
    await enviarPushNotificacoesSolicitacao(sb, 's1')
    expect(await enviarPushNotificacoesSolicitacao(sb, 's1')).toBe(0)
    expect(enviarPushParaUsuario).toHaveBeenCalledTimes(1)
    expect(notifs[0].dados_json).toMatchObject({ prioridade: 'x' })  // preserva o que já havia
  })
})
