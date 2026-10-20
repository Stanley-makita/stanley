import type { StatusSolicitacao } from '@/types/solicitacoes-operacionais'

// Aviso por WhatsApp das respostas de uma solicitação (pedido da equipe, 20/10/2026).
// Regras puras — a rota /api/solicitacoes/[id]/aviso faz a leitura/gravação e o envio.
//
// Quem recebe: quem PEDIU e o comercial do lead/negócio (uma mensagem só quando forem a
// mesma pessoa). Cada um recebe só as mensagens que NÃO escreveu. Espera 1 minuto sem
// novidade (várias mensagens seguidas = um aviso só) e para depois de avisar a conclusão.

export const ESPERA_AVISO_MS = 60_000
// Folga para o relógio do servidor x banco: mensagem "de agora" com até 2s de diferença.
const FOLGA_MS = 2_000
const MAX_MENSAGENS = 5
const MAX_CARACTERES = 400

export const STATUS_ENCERRADOS: StatusSolicitacao[] = ['concluido', 'cancelado']

export interface MensagemNova {
  autor_id: string
  texto: string
  created_at: string
}

export type DecisaoAvisoSolicitacao =
  | { acao: 'avisar' }
  | { acao: 'ignorar'; motivo: 'sem_novidade' | 'ainda_movimentando' | 'ja_encerrada' }

export function decidirAvisoSolicitacao(e: {
  mensagensNovas: MensagemNova[]
  statusAvisado: string | null
  agora: number
}): DecisaoAvisoSolicitacao {
  if (e.statusAvisado && (STATUS_ENCERRADOS as string[]).includes(e.statusAvisado)) {
    return { acao: 'ignorar', motivo: 'ja_encerrada' }
  }
  if (e.mensagensNovas.length === 0) return { acao: 'ignorar', motivo: 'sem_novidade' }
  const ultima = Math.max(...e.mensagensNovas.map(m => new Date(m.created_at).getTime()))
  // Chegou mensagem durante a espera: o pedido dela avisa tudo junto, 1 minuto depois.
  if (ultima > e.agora - ESPERA_AVISO_MS + FOLGA_MS) return { acao: 'ignorar', motivo: 'ainda_movimentando' }
  return { acao: 'avisar' }
}

/** Para cada destinatário (sem repetir), as mensagens que ele não escreveu. */
export function destinatariosDoAviso(
  candidatos: Array<string | null | undefined>,
  mensagens: MensagemNova[],
): Array<{ usuarioId: string; mensagens: MensagemNova[] }> {
  const unicos = Array.from(new Set(candidatos.filter((c): c is string => !!c)))
  return unicos
    .map(usuarioId => ({ usuarioId, mensagens: mensagens.filter(m => m.autor_id !== usuarioId) }))
    .filter(d => d.mensagens.length > 0)
}

function cortar(texto: string): string {
  const t = texto.trim()
  return t.length > MAX_CARACTERES ? `${t.slice(0, MAX_CARACTERES - 1)}…` : t
}

export function montarMensagemAvisoSolicitacao(p: {
  tipoRotulo: string
  clienteNome: string | null
  solicitanteNome: string | null
  responsavelNome: string | null
  statusRotulo: string
  encerrada: boolean
  mensagens: Array<{ autorNome: string; texto: string; hora: string }>
}): string {
  const comTexto = p.mensagens.filter(m => m.texto.trim())
  const mostradas = comTexto.slice(-MAX_MENSAGENS)
  const ocultas = comTexto.length - mostradas.length
  const linhaPessoas = [
    p.solicitanteNome && `Pedido por ${p.solicitanteNome}`,
    p.responsavelNome && `Para ${p.responsavelNome}`,
  ].filter(Boolean).join(' · ')

  return [
    `🔔 *Fonti — Solicitação*`,
    ``,
    `*${[p.tipoRotulo, p.clienteNome].filter(Boolean).join(' — ')}*`,
    ...(linhaPessoas ? [linhaPessoas] : []),
    `Status: ${p.encerrada ? '✅ ' : ''}*${p.statusRotulo}*`,
    ...(ocultas > 0 ? [``, `(+${ocultas} ${ocultas > 1 ? 'mensagens anteriores' : 'mensagem anterior'} no Fonti)`] : []),
    ...mostradas.flatMap(m => [``, `💬 *${m.autorNome}* (${m.hora}):`, cortar(m.texto)]),
  ].join('\n')
}
