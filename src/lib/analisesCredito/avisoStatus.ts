import type { StatusAnaliseCredito } from '@/types/leads'

// Aviso ao comercial do cliente quando o status de uma análise de crédito muda
// (pedido da equipe comercial, 03/10/2026). Regras puras — a rota
// /api/analises-credito/[id]/aviso-status faz a leitura/gravação e o envio.

export const ESPERA_AVISO_MS = 60_000

export const ROTULO_STATUS_ANALISE: Record<StatusAnaliseCredito, string> = {
  em_analise: 'Em Análise',
  aprovado:   'Aprovado',
  recusado:   'Recusado',
  pendente:   'Pendente',
}

const EMOJI_STATUS: Record<StatusAnaliseCredito, string> = {
  em_analise: '⏳',
  aprovado:   '✅',
  recusado:   '❌',
  pendente:   '⚠️',
}

export function statusAnaliseValido(v: unknown): v is StatusAnaliseCredito {
  return typeof v === 'string' && v in ROTULO_STATUS_ANALISE
}

export type DecisaoAviso =
  | { acao: 'avisar' }
  /** Marca como avisado sem enviar: quem mudou é o próprio comercial do cliente. */
  | { acao: 'marcar_sem_enviar' }
  | { acao: 'ignorar'; motivo: 'status_mudou_de_novo' | 'ja_avisado' | 'sem_comercial' }

export interface EntradaDecisao {
  /** Status que ESTE pedido gravou (o que a tela acabou de salvar). */
  statusPedido: StatusAnaliseCredito
  /** Status da análise depois da espera de 1 minuto. */
  statusAtual: StatusAnaliseCredito
  ultimoAvisado: StatusAnaliseCredito | null
  comercialId: string | null
  atorId: string
}

export function decidirAviso(e: EntradaDecisao): DecisaoAviso {
  // Mudou de novo durante a espera: o pedido da mudança mais recente cuida do aviso.
  if (e.statusAtual !== e.statusPedido) return { acao: 'ignorar', motivo: 'status_mudou_de_novo' }
  // Voltou ao que já foi avisado (ou outro pedido já avisou este status).
  if (e.statusAtual === e.ultimoAvisado) return { acao: 'ignorar', motivo: 'ja_avisado' }
  if (!e.comercialId) return { acao: 'ignorar', motivo: 'sem_comercial' }
  if (e.comercialId === e.atorId) return { acao: 'marcar_sem_enviar' }
  return { acao: 'avisar' }
}

export function montarMensagemAviso(p: {
  clienteNome: string
  bancoNome: string | null
  status: StatusAnaliseCredito
  alteradoPor: string | null
}): string {
  const linhaCliente = [p.clienteNome, p.bancoNome].filter(Boolean).join(' — ')
  return [
    `🔔 *Fonti — Análise de crédito*`,
    ``,
    `*${linhaCliente}*`,
    `Status: ${EMOJI_STATUS[p.status]} *${ROTULO_STATUS_ANALISE[p.status]}*`,
    ...(p.alteradoPor ? [``, `Atualizado por ${p.alteradoPor}.`] : []),
  ].join('\n')
}
