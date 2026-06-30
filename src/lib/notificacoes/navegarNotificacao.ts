import { EntidadeNotificacao } from '@/types/notificacoes'

/**
 * Resolve a rota de destino de uma notificação a partir da entidade.
 * Função pura, sem React — reaproveitada pelo sino (router.push) e pelo
 * toast (action.onClick), para nunca duplicar a lógica de navegação.
 * Novo tipo de evento no futuro = um novo `case` aqui, nada mais.
 */
export function resolverRotaNotificacao(
  entidade: EntidadeNotificacao | string | null,
  entidadeId: string | null
): string | null {
  if (!entidadeId) return null

  switch (entidade) {
    case 'processo':
      return `/processos/${entidadeId}`
    case 'lead':
      return `/leads/${entidadeId}`
    case 'tarefa':
      return `/agenda?tarefa=${entidadeId}&fonte=processo`
    case 'lead_tarefa':
      return `/agenda?tarefa=${entidadeId}&fonte=lead`
    default:
      // 'solicitacao' ainda não tem deep-link próprio na UI — sem rota até existir.
      return null
  }
}
