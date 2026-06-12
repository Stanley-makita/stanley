'use client'

import { useRef } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { type Lead } from '@/types/leads'
import { type TarefaStatusLead } from '@/hooks/leads/useLeadsTarefasStatus'
import { AlertCircle, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { differenceInDays } from 'date-fns'

const PRODUTO_CONFIG: Record<string, { label: string; className: string }> = {
  financiamento: { label: 'Financiamento', className: 'bg-blue-100 text-blue-700' },
  cgi:           { label: 'CGI',           className: 'bg-purple-100 text-purple-700' },
  consorcio:     { label: 'Consórcio',     className: 'bg-orange-100 text-orange-700' },
  portabilidade: { label: 'Portabilidade', className: 'bg-gray-100 text-gray-600' },
}

function produtoConfig(produto: string | null | undefined) {
  if (!produto) return null
  const key = produto.toLowerCase()
  if (key.includes('financ')) return PRODUTO_CONFIG.financiamento
  if (key.includes('cgi'))    return PRODUTO_CONFIG.cgi
  if (key.includes('cons'))   return PRODUTO_CONFIG.consorcio
  if (key.includes('port'))   return PRODUTO_CONFIG.portabilidade
  return { label: produto, className: 'bg-gray-100 text-gray-600' }
}

function iniciais(nome: string) {
  return nome.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
}

interface Props {
  lead: Lead
  overlay?: boolean
  onAbrirLead?: (id: string) => void
  tarefaStatus?: TarefaStatusLead
}

export function KanbanCard({ lead, overlay = false, onAbrirLead, tarefaStatus }: Props) {
  const mouseDownPos = useRef<{ x: number; y: number } | null>(null)

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: lead.id, data: { lead } })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const produto = produtoConfig(lead.produto_interesse)
  const diasNoSistema = differenceInDays(new Date(), new Date(lead.created_at))

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        'bg-white border rounded-lg p-2.5 cursor-grab active:cursor-grabbing',
        'shadow-sm hover:shadow-md transition-shadow select-none',
        isDragging ? 'opacity-40 border-[#C2AA6A]' : 'border-gray-200',
        overlay && 'shadow-lg rotate-1 opacity-95',
      )}
      onMouseDown={(e) => { mouseDownPos.current = { x: e.clientX, y: e.clientY } }}
      onClick={(e) => {
        e.stopPropagation()
        if (mouseDownPos.current) {
          const dx = e.clientX - mouseDownPos.current.x
          const dy = e.clientY - mouseDownPos.current.y
          if (Math.sqrt(dx * dx + dy * dy) < 5) onAbrirLead?.(lead.id)
        }
        mouseDownPos.current = null
      }}
    >
      {/* Nome */}
      <p className="text-xs font-semibold text-[#253B29] leading-snug truncate">
        {lead.nome}
      </p>

      {/* Badges linha */}
      <div className="flex flex-wrap items-center gap-1 mt-1.5">
        {produto && (
          <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full', produto.className)}>
            {produto.label}
          </span>
        )}
        {lead.status && (
          <span
            className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full border"
            style={{
              backgroundColor: lead.status.cor ? `${lead.status.cor}18` : '#f3f4f6',
              borderColor:     lead.status.cor ? `${lead.status.cor}40` : '#e5e7eb',
              color:           lead.status.cor ?? '#374151',
            }}
          >
            {lead.status.nome}
          </span>
        )}
      </div>

      {/* Rodapé: tarefas + responsável + dias */}
      <div className="flex items-center justify-between gap-1 mt-2">
        <TarefaIndicador status={tarefaStatus} />

        <div className="flex items-center gap-2 shrink-0 ml-auto">
          {/* Responsável: avatar com iniciais */}
          {lead.responsavel && (
            <div
              className="w-5 h-5 rounded-full bg-[#253B29]/15 flex items-center justify-center"
              title={lead.responsavel.nome}
            >
              <span className="text-[9px] font-bold text-[#253B29]">{iniciais(lead.responsavel.nome)}</span>
            </div>
          )}

          {/* Dias no sistema */}
          <span className="text-[10px] text-gray-400 tabular-nums">
            {diasNoSistema === 0 ? 'hoje' : `${diasNoSistema}d`}
          </span>
        </div>
      </div>
    </div>
  )
}

function TarefaIndicador({ status }: { status?: TarefaStatusLead }) {
  if (!status) return null
  const { vencidas, pendentes } = status

  if (vencidas > 0) {
    return (
      <div className="flex items-center gap-1 text-[10px] font-semibold text-red-600">
        <AlertCircle className="h-3 w-3 shrink-0" />
        <span>{vencidas} vencida{vencidas !== 1 ? 's' : ''}</span>
      </div>
    )
  }

  if (pendentes > 0) {
    return (
      <div className="flex items-center gap-1 text-[10px] font-medium text-amber-600">
        <Clock className="h-3 w-3 shrink-0" />
        <span>{pendentes} a fazer</span>
      </div>
    )
  }

  return null
}
