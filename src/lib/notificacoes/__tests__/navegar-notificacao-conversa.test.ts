/**
 * Fase 4 do plano de push/PWA: notificação de nova mensagem (entidade='conversa')
 * precisa abrir /conversas?id=<conversaId> — a página de Conversas já lê esse
 * parâmetro (ver conversas/page.tsx), só faltava o `case` aqui.
 */
import { describe, it, expect } from 'vitest'
import { resolverRotaNotificacao } from '../navegarNotificacao'

describe('resolverRotaNotificacao — conversa', () => {
  it('leva pra /conversas?id=<conversaId>', () => {
    expect(resolverRotaNotificacao('conversa', 'conversa-123')).toBe('/conversas?id=conversa-123')
  })

  it('sem entidadeId, não navega (mesma regra de qualquer outro tipo)', () => {
    expect(resolverRotaNotificacao('conversa', null)).toBeNull()
  })

  it('outros tipos continuam funcionando como antes', () => {
    expect(resolverRotaNotificacao('lead', 'l1')).toBe('/leads/l1')
    expect(resolverRotaNotificacao('processo', 'p1')).toBe('/processos/p1')
  })
})
