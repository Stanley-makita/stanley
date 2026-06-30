'use client'

import { useLeadHistorico } from '@/hooks/leads/useLeadHistorico'
import { buildTimelineSummary, getTimelineBadge } from './timelineUtils'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ArrowRight, GitBranch, Plus, Edit, History, MessageSquare, Calculator, FileText, ClipboardList, Bell, CheckCircle2, XCircle } from 'lucide-react'

const ICONES = {
  historico: Edit,
  simulacao: Calculator,
  documento: FileText,
  solicitacao: ClipboardList,
  criacao: Plus,
  fase_mudanca: GitBranch,
  comentario: MessageSquare,
  followup_iniciado: Bell,
  followup_notificacao: Bell,
  followup_resposta: CheckCircle2,
  followup_encerrado: XCircle,
}

interface Props { leadId: string }

export function AbaHistorico({ leadId }: Props) {
  const { data: eventos = [], isLoading } = useLeadHistorico(leadId)

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-400">
        Linha do tempo consolidada com alterações, simulações, documentos e solicitações deste lead.
      </p>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="animate-pulse flex gap-3">
              <div className="w-7 h-7 bg-gray-100 rounded-full shrink-0" />
              <div className="flex-1 space-y-1">
                <div className="h-3 bg-gray-100 rounded w-3/4" />
                <div className="h-2.5 bg-gray-100 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : eventos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <History className="h-8 w-8 text-gray-200 mb-3" />
          <p className="text-sm text-gray-400">Nenhum evento registrado ainda.</p>
        </div>
      ) : (
        <div className="relative">
          <div className="absolute left-3.5 top-0 bottom-0 w-px bg-gray-100" />

          <div className="space-y-3">
            {eventos.map((item) => {
              const tipoIcone = (item.kind === 'historico' ? item.tipo : item.kind) as keyof typeof ICONES
              const Icone = ICONES[tipoIcone] ?? Edit
              const titulo = item.kind === 'historico' && item.tipo === 'fase_mudanca' && item.fase_anterior && item.fase_nova
                ? 'Mudança de fase'
                : item.kind === 'historico' && item.tipo === 'criacao'
                  ? 'Lead criado'
                  : item.kind === 'historico' && item.tipo === 'comentario'
                    ? 'Comentário'
                    : item.kind === 'historico' && item.tipo === 'followup_iniciado'
                      ? 'Acompanhamento iniciado'
                      : item.kind === 'historico' && item.tipo === 'followup_notificacao'
                        ? 'Follow-up enviado'
                        : item.kind === 'historico' && item.tipo === 'followup_resposta'
                          ? 'Resposta do comercial'
                          : item.kind === 'historico' && item.tipo === 'followup_encerrado'
                            ? 'Acompanhamento encerrado'
                            : item.kind === 'simulacao'
                              ? 'Simulação salva'
                              : item.kind === 'documento'
                                ? 'Documento anexado'
                                : item.kind === 'solicitacao'
                                  ? 'Solicitação operacional'
                                  : 'Evento'

              return (
                <div key={item.id} className="flex gap-3 relative">
                  <div className="w-7 h-7 rounded-full border-2 bg-white border-gray-200 flex items-center justify-center shrink-0 z-10">
                    <Icone className="h-3 w-3 text-fonti-primary" />
                  </div>

                  <div className="flex-1 pb-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-gray-700">{titulo}</p>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                        {getTimelineBadge(item.kind, item)}
                      </span>
                    </div>

                    {item.kind === 'historico' && item.tipo === 'fase_mudanca' && item.fase_anterior && item.fase_nova ? (
                      <p className="text-sm text-gray-600 mt-1">
                        Movido de{' '}
                        <span className="font-medium text-fonti-primary">{item.fase_anterior.nome}</span>
                        {' '}
                        <ArrowRight className="inline h-3 w-3 text-gray-400" />
                        {' '}
                        <span className="font-medium text-fonti-primary">{item.fase_nova.nome}</span>
                      </p>
                    ) : (
                      <p className="text-sm text-gray-600 mt-1">
                        {buildTimelineSummary(item.kind, item)}
                      </p>
                    )}

                    <p className="text-xs text-gray-400 mt-1">
                      {item.usuario?.nome ?? 'Sistema'} ·{' '}
                      {formatDistanceToNow(new Date(item.created_at), { addSuffix: true, locale: ptBR })}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
