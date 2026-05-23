'use client'

import { format, isToday, isBefore, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { TarefaAgenda, PrioridadeTarefa } from '@/types/agenda'
import { cn } from '@/lib/utils'
import { useRouter } from 'next/navigation'

const PRIORIDADE_LABEL: Record<PrioridadeTarefa, string> = {
  alta:  'Alta',
  media: 'Média',
  baixa: 'Baixa',
}

const PRIORIDADE_COLOR: Record<PrioridadeTarefa, string> = {
  alta:  'bg-red-100 text-red-700',
  media: 'bg-amber-100 text-amber-700',
  baixa: 'bg-gray-100 text-gray-600',
}

interface TarefaCardProps {
  tarefa: TarefaAgenda
  onToggle: (id: string, concluida: boolean) => void
}

export function TarefaCard({ tarefa, onToggle }: TarefaCardProps) {
  const router = useRouter()

  const vencimento = tarefa.tarefa_vencimento ? parseISO(tarefa.tarefa_vencimento) : null
  const estaVencida = vencimento && !tarefa.concluida && isBefore(vencimento, new Date()) && !isToday(vencimento)
  const eHoje = vencimento && isToday(vencimento)

  const corVencimento = tarefa.concluida
    ? 'text-gray-400'
    : estaVencida
    ? 'text-red-600 font-semibold'
    : eHoje
    ? 'text-amber-600 font-semibold'
    : 'text-gray-500'

  return (
    <div className={cn(
      'flex items-start gap-3 p-3 rounded-lg border bg-white hover:shadow-sm transition-shadow',
      tarefa.concluida && 'opacity-60',
      estaVencida && !tarefa.concluida && 'border-red-200 bg-red-50/30'
    )}>
      {/* Checkbox */}
      <input
        type="checkbox"
        checked={tarefa.concluida}
        onChange={(e) => onToggle(tarefa.tarefa_id, e.target.checked)}
        className="mt-0.5 w-4 h-4 rounded accent-[#253B29] cursor-pointer shrink-0"
      />

      {/* Conteúdo */}
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm font-medium text-gray-800', tarefa.concluida && 'line-through text-gray-400')}>
          {tarefa.tarefa_titulo}
        </p>

        {/* Processo */}
        <button
          onClick={() => router.push(`/processos/${tarefa.processo_id}`)}
          className="text-xs text-[#253B29] hover:text-[#C2AA6A] hover:underline truncate block mt-0.5 text-left"
        >
          #{tarefa.processo_numero} · {tarefa.processo_nome_imovel}
        </button>

        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {/* Prioridade */}
          <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium', PRIORIDADE_COLOR[tarefa.tarefa_prioridade])}>
            {PRIORIDADE_LABEL[tarefa.tarefa_prioridade]}
          </span>

          {/* Vencimento */}
          {vencimento && (
            <span className={cn('text-xs', corVencimento)}>
              {estaVencida
                ? `Venceu ${format(vencimento, "dd/MM", { locale: ptBR })}`
                : eHoje
                ? 'Vence hoje'
                : format(vencimento, "dd/MM", { locale: ptBR })}
            </span>
          )}

          {/* Responsável */}
          <span className="text-xs text-gray-400 ml-auto truncate max-w-[120px]">
            {tarefa.responsavel_nome}
          </span>
        </div>
      </div>
    </div>
  )
}