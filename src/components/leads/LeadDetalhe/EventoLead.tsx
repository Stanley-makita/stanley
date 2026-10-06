'use client'

import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  ArrowRight, GitBranch, Plus, Edit, MessageSquare, Calculator, FileText, ClipboardList, Bell,
  CheckCircle2, XCircle, Send, Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { type LeadTimelineItem } from '@/hooks/leads/useLeadHistorico'
import { AnexoChipEnviado } from '@/components/documentos/AnexoChip'
import { parseCabecalhoComunicacao, LABEL_TIPO_INTERESSADO_TIMELINE } from '@/lib/comunicacao/parseCabecalhoComunicacao'
import { buildTimelineSummary, getTimelineBadge } from './timelineUtils'

// Um evento do histórico do lead (nota, mudança de fase, simulação, documento,
// solicitação...). Usado na aba Histórico da Captação e no bloco da Captação
// da aba Histórico do Negócio — mesmo desenho nos dois lugares.

const ICONES: Record<string, LucideIcon> = {
  historico: Edit,
  simulacao: Calculator,
  documento: FileText,
  solicitacao: ClipboardList,
  criacao: Plus,
  fase_mudanca: GitBranch,
  comentario: MessageSquare,
  acao_operacional: Zap,
  followup_iniciado: Bell,
  followup_notificacao: Bell,
  followup_resposta: CheckCircle2,
  followup_encerrado: XCircle,
  comunicacao: Send,
}

const TITULOS_HISTORICO: Record<string, string> = {
  criacao: 'Lead criado',
  comentario: 'Nota',
  acao_operacional: 'Registro',
  edicao: 'Alteração',
  followup_iniciado: 'Acompanhamento iniciado',
  followup_notificacao: 'Follow-up enviado',
  followup_resposta: 'Resposta do comercial',
  followup_encerrado: 'Acompanhamento encerrado',
}

export function iconeEventoLead(item: LeadTimelineItem): LucideIcon {
  const chave = item.kind === 'historico' ? item.tipo : item.kind
  return ICONES[chave] ?? Edit
}

function tituloEventoLead(item: LeadTimelineItem): string {
  if (item.kind === 'simulacao') return 'Simulação salva'
  if (item.kind === 'documento') return 'Documento anexado'
  if (item.kind === 'solicitacao') return 'Solicitação operacional'
  if (item.tipo === 'fase_mudanca') return 'Mudança de fase'
  if (item.tipo === 'comunicacao') {
    const parsed = parseCabecalhoComunicacao(item.descricao)
    return parsed
      ? `Mensagem enviada ao ${LABEL_TIPO_INTERESSADO_TIMELINE[parsed.tipo]} — ${parsed.nome}`
      : 'Mensagem enviada ao cliente'
  }
  return TITULOS_HISTORICO[item.tipo] ?? 'Evento'
}

/** Título + etiqueta + conteúdo + autor/data de um evento do lead (sem o ícone). */
export function ConteudoEventoLead({ item }: { item: LeadTimelineItem }) {
  const comunicacao = item.kind === 'historico' && item.tipo === 'comunicacao'
    ? parseCabecalhoComunicacao(item.descricao)
    : null

  let conteudo: React.ReactNode
  if (item.kind === 'historico' && item.tipo === 'fase_mudanca' && item.fase_anterior && item.fase_nova) {
    conteudo = (
      <>
        Movido de <span className="font-medium text-fonti-primary">{item.fase_anterior.nome}</span>{' '}
        <ArrowRight className="inline h-3 w-3 text-gray-400" />{' '}
        <span className="font-medium text-fonti-primary">{item.fase_nova.nome}</span>
      </>
    )
  } else if (item.kind === 'documento' && item.titulo) {
    conteudo = <>{item.titulo} · {buildTimelineSummary(item.kind, item)}</>
  } else if (comunicacao) {
    conteudo = comunicacao.mensagem
  } else {
    conteudo = buildTimelineSummary(item.kind, item)
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium text-gray-700">{tituloEventoLead(item)}</p>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
          {getTimelineBadge(item.kind, item)}
        </span>
      </div>
      <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{conteudo}</p>
      {item.anexos && item.anexos.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-1.5">
          {item.anexos.map((anexo) => <AnexoChipEnviado key={anexo.id} anexo={anexo} />)}
        </div>
      )}
      <p className="text-xs text-gray-400 mt-1">
        {item.usuario?.nome ?? 'Sistema'} ·{' '}
        {formatDistanceToNow(new Date(item.created_at), { addSuffix: true, locale: ptBR })}
      </p>
    </div>
  )
}
