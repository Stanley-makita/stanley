'use client'

import { TarefaAgenda, PrioridadeTarefa } from '@/types/agenda'
import { cn } from '@/lib/utils'

const PRIORIDADE_COLOR: Record<PrioridadeTarefa, string> = {
  alta:    'bg-red-100 text-red-700',
  media:   'bg-amber-100 text-amber-700',
  baixa:   'bg-gray-100 text-gray-600',
  urgente: 'bg-red-200 text-red-800',
}

interface TarefaChipProps {
  tarefa: TarefaAgenda
  onClick: (tarefaId: string, fonte: 'processo' | 'lead' | 'compromisso') => void
}

/** Versão compacta do TarefaCard, feita pra caber dentro da célula de um dia no calendário mensal. */
export function TarefaChip({ tarefa, onClick }: TarefaChipProps) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onClick(tarefa.tarefa_id, tarefa.fonte)
      }}
      title={tarefa.tarefa_titulo}
      className={cn(
        'w-full text-left text-[11px] leading-tight px-1.5 py-1 rounded truncate transition-opacity hover:opacity-80',
        tarefa.concluida
          ? 'bg-gray-100 text-gray-400 line-through'
          : PRIORIDADE_COLOR[tarefa.tarefa_prioridade],
      )}
    >
      {tarefa.tarefa_titulo}
    </button>
  )
}
