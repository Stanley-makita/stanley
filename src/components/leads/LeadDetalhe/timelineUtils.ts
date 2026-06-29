export type TimelineEventKind = 'historico' | 'simulacao' | 'documento' | 'solicitacao' | 'comentario' | 'criacao' | 'fase' | 'default'

interface TimelineContext {
  tipo?: string
  resultado_json?: Record<string, unknown> | null
  ocr_status?: string | null
  status?: string | null
  titulo?: string | null
  descricao?: string | null
}

const BRL = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

export function buildTimelineSummary(kind: TimelineEventKind, context: TimelineContext = {}) {
  if (kind === 'simulacao' && context.resultado_json) {
    try {
      const bancos = context.resultado_json.bancos as Array<{ elegivel?: boolean; bancoNome?: string; primeiraParcela?: number }> | undefined
      const melhor = bancos?.find((b) => b.elegivel)
      if (melhor?.bancoNome && typeof melhor.primeiraParcela === 'number') {
        return `${melhor.bancoNome} • 1ª parcela ${BRL(melhor.primeiraParcela)}`
      }
    } catch {
      // noop
    }
  }

  if (kind === 'documento') {
    const status = context.ocr_status ?? 'pendente'
    if (status === 'concluido') return 'Documento processado por OCR'
    if (status === 'processando') return 'OCR em andamento'
    if (status === 'erro') return 'OCR com erro'
    return 'Documento anexado'
  }

  if (kind === 'solicitacao') {
    return context.titulo ?? 'Solicitação operacional'
  }

  if (kind === 'comentario') {
    return context.descricao ?? 'Comentário registrado'
  }

  if (context.descricao) return context.descricao
  return 'Evento registrado'
}

export function getTimelineBadge(kind: TimelineEventKind, context: TimelineContext = {}) {
  if (kind === 'documento') {
    const status = context.ocr_status ?? 'pendente'
    if (status === 'concluido') return 'OCR concluído'
    if (status === 'processando') return 'OCR em andamento'
    if (status === 'erro') return 'OCR com erro'
    return 'Documento'
  }

  if (kind === 'solicitacao') {
    return context.status ? `Solicitação • ${context.status}` : 'Solicitação'
  }

  return 'Evento'
}
