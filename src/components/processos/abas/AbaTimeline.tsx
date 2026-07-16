'use client'

import { useProcessoTimeline } from '@/hooks/processos/useProcessoTimeline'
import { type TimelineItem, type ProcessoComentario, type ProcessoFaseHistorico, type ProcessoTarefa } from '@/types/processos'
import { Badge } from '@/components/ui/badge'
import { MessageSquare, ArrowRight, CheckSquare, Clock } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const TIPO_CONFIG = {
  comentario:      { icone: MessageSquare, cor: 'bg-blue-100 text-blue-600',   label: 'Comentário' },
  fase:            { icone: ArrowRight,    cor: 'bg-purple-100 text-purple-600', label: 'Fase' },
  tarefa_criada:   { icone: Clock,         cor: 'bg-amber-100 text-amber-600',  label: 'Tarefa criada' },
  tarefa_concluida:{ icone: CheckSquare,   cor: 'bg-green-100 text-green-600',  label: 'Tarefa concluída' },
} as const

function ItemComentario({ payload }: { payload: ProcessoComentario }) {
  const TIPOS: Record<string, { label: string; className: string }> = {
    observacao:          { label: 'Observação',        className: 'bg-gray-100 text-gray-600' },
    alteracao:           { label: 'Alteração',         className: 'bg-amber-100 text-amber-700' },
    solicitacao:         { label: 'Solicitação',        className: 'bg-blue-100 text-blue-700' },
    comunicacao_cliente: { label: 'Mensagem ao cliente', className: 'bg-green-100 text-green-700' },
  }
  const config = TIPOS[payload.tipo] ?? TIPOS.observacao
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-medium text-fonti-primary">{payload.usuario?.nome ?? 'Sistema'}</span>
        <Badge className={`text-xs px-1.5 py-0 ${config.className}`}>{config.label}</Badge>
      </div>
      <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-2.5">{payload.texto}</p>
    </div>
  )
}

function ItemFase({ payload }: { payload: ProcessoFaseHistorico }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: payload.fase?.cor ?? 'var(--fonti-primary)' }} />
      <span className="text-sm font-medium text-fonti-primary">Avançou para {payload.fase?.nome ?? '—'}</span>
      <span className="text-xs text-gray-400">por {payload.usuario?.nome ?? 'Sistema'}</span>
      {payload.observacao && (
        <span className="text-xs text-gray-500 italic">"{payload.observacao}"</span>
      )}
    </div>
  )
}

function ItemTarefa({ item }: { item: TimelineItem & { tipo: 'tarefa_criada' | 'tarefa_concluida' } }) {
  const t = item.payload as ProcessoTarefa
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-fonti-primary">
        {item.tipo === 'tarefa_concluida' ? 'Concluiu tarefa' : 'Criou tarefa'}:
      </span>
      <span className="text-sm font-medium text-fonti-primary">{t.titulo}</span>
    </div>
  )
}

interface Props { processoId: string }

export function AbaTimeline({ processoId }: Props) {
  const { data: items = [], isLoading } = useProcessoTimeline(processoId)

  if (isLoading) {
    return <div className="space-y-4">{[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-gray-100 animate-pulse rounded-xl" />)}</div>
  }

  if (items.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-8">Nenhum evento registrado.</p>
  }

  return (
    <div className="relative">
      <div className="absolute left-4 top-4 bottom-4 w-px bg-gray-200" />
      <div className="space-y-4">
        {items.map((item, idx) => {
          const config = TIPO_CONFIG[item.tipo]
          const Icone = config.icone

          return (
            <div key={idx} className="relative flex gap-4 pl-10">
              <div className={`absolute left-2.5 -translate-x-1/2 w-6 h-6 rounded-full flex items-center justify-center ${config.cor}`}>
                <Icone className="h-3 w-3" />
              </div>
              <div className="flex-1 bg-white border border-gray-100 rounded-xl p-4">
                <div className="flex items-start justify-between mb-2">
                  <Badge variant="outline" className={`text-xs ${config.cor}`}>{config.label}</Badge>
                  <span className="text-xs text-gray-400">
                    {formatDistanceToNow(new Date(item.data), { addSuffix: true, locale: ptBR })}
                  </span>
                </div>

                {item.tipo === 'comentario' && <ItemComentario payload={item.payload as ProcessoComentario} />}
                {item.tipo === 'fase' && <ItemFase payload={item.payload as ProcessoFaseHistorico} />}
                {(item.tipo === 'tarefa_criada' || item.tipo === 'tarefa_concluida') && <ItemTarefa item={item as TimelineItem & { tipo: 'tarefa_criada' | 'tarefa_concluida' }} />}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}