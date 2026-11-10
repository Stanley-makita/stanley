import { compradoresDaProposta } from '@/lib/participantes/resumo'
import type { SolicitacaoOperacional } from '@/types/solicitacoes-operacionais'

/**
 * Busca e período da tela de Solicitações (pedido da equipe, 10/11/2026): achar as solicitações de um cliente
 * (nome do lead, da pessoa ou de qualquer comprador do negócio, título, nº do processo) e limitar pelos últimos
 * N dias de criação.
 */
export const PERIODOS_FILA = [
  { valor: 'todos', rotulo: 'Qualquer data', dias: null },
  { valor: '5', rotulo: 'Últimos 5 dias', dias: 5 },
  { valor: '10', rotulo: 'Últimos 10 dias', dias: 10 },
  { valor: '30', rotulo: 'Últimos 30 dias', dias: 30 },
  { valor: '90', rotulo: 'Últimos 90 dias', dias: 90 },
] as const

export type PeriodoFila = (typeof PERIODOS_FILA)[number]['valor']

/** Início do período (meia-noite de N-1 dias atrás: "últimos 5 dias" inclui hoje e os 4 anteriores). */
export function inicioDoPeriodo(periodo: PeriodoFila, agora: Date = new Date()): string | undefined {
  const dias = PERIODOS_FILA.find(p => p.valor === periodo)?.dias
  if (!dias) return undefined
  const d = new Date(agora)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - (dias - 1))
  return d.toISOString()
}

const normalizar = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

function textosDaSolicitacao(s: SolicitacaoOperacional): string[] {
  const compradores = compradoresDaProposta(s.processo?.participantes).map(c => c.nome)
  return [
    s.titulo, s.lead?.nome, s.pessoa?.nome, s.processo?.numero_processo, s.processo?.nome_imovel, ...compradores,
  ].filter((t): t is string => !!t)
}

/** Todas as palavras digitadas precisam aparecer (em qualquer campo), sem acento nem maiúscula. */
export function filtrarPorBusca<T extends SolicitacaoOperacional>(lista: T[], termo: string): T[] {
  const palavras = normalizar(termo).split(' ').filter(Boolean)
  if (!palavras.length) return lista
  return lista.filter(s => {
    const texto = normalizar(textosDaSolicitacao(s).join(' '))
    return palavras.every(p => texto.includes(p))
  })
}
