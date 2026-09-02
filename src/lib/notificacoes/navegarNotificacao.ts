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
    case 'compromisso':
      // Compromisso não tem deep-link próprio (é autocontido, sem modal de
      // detalhe) — só leva pra Agenda, onde ele já aparece na lista/calendário.
      return '/agenda'
    case 'solicitacao':
      // Sem deep-link por item ainda — leva pra Fila Operacional, onde a
      // solicitação já aparece na coluna "Novo" (mesmo padrão de 'compromisso').
      return '/operacional'
    default:
      return null
  }
}
