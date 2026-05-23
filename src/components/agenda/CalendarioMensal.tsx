'use client'

import {
  startOfMonth, endOfMonth, eachDayOfInterval, getDay,
  isSameDay, isSameMonth, isToday, isBefore, format,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { TarefaAgenda } from '@/types/agenda'
import { cn } from '@/lib/utils'

interface CalendarioMensalProps {
  mes: Date
  tarefas: TarefaAgenda[]
  diaSelecionado: Date | null
  onDiaClick: (dia: Date) => void
}

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

export function CalendarioMensal({ mes, tarefas, diaSelecionado, onDiaClick }: CalendarioMensalProps) {
  const inicio = startOfMonth(mes)
  const fim    = endOfMonth(mes)
  const dias   = eachDayOfInterval({ start: inicio, end: fim })

  // Dias em branco antes do dia 1
  const offsetInicio = getDay(inicio)
  const celulasVazias = Array.from({ length: offsetInicio })

  function tarefasDoDia(dia: Date): TarefaAgenda[] {
    return tarefas.filter(
      (t) => t.tarefa_vencimento && isSameDay(new Date(t.tarefa_vencimento), dia)
    )
  }

  function temVencida(dia: Date): boolean {
    return tarefasDoDia(dia).some((t) => !t.concluida && isBefore(new Date(t.tarefa_vencimento!), new Date()))
  }

  return (
    <div className="select-none">
      {/* Cabeçalho dias da semana */}
      <div className="grid grid-cols-7 mb-1">
        {DIAS_SEMANA.map((d) => (
          <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Grade de dias */}
      <div className="grid grid-cols-7 gap-y-1">
        {celulasVazias.map((_, i) => (
          <div key={`vazio-${i}`} />
        ))}

        {dias.map((dia) => {
          const tf = tarefasDoDia(dia)
          const selecionado = diaSelecionado ? isSameDay(dia, diaSelecionado) : false
          const hoje = isToday(dia)
          const vencida = temVencida(dia)
          const mesAtual = isSameMonth(dia, mes)

          return (
            <button
              key={dia.toISOString()}
              onClick={() => onDiaClick(dia)}
              className={cn(
                'flex flex-col items-center gap-0.5 py-1.5 rounded-lg transition-colors',
                mesAtual ? 'hover:bg-gray-100' : 'opacity-30 pointer-events-none',
                selecionado && 'bg-[#253B29] text-white hover:bg-[#253B29]',
                hoje && !selecionado && 'ring-1 ring-[#C2AA6A]'
              )}
            >
              <span className={cn(
                'text-sm font-medium leading-none',
                selecionado ? 'text-white' : hoje ? 'text-[#253B29]' : 'text-gray-700'
              )}>
                {format(dia, 'd')}
              </span>

              {/* Pontos de tarefas */}
              {tf.length > 0 && (
                <div className="flex gap-0.5">
                  {tf.slice(0, 3).map((t) => (
                    <div
                      key={t.tarefa_id}
                      className={cn(
                        'w-1.5 h-1.5 rounded-full',
                        t.concluida
                          ? 'bg-gray-300'
                          : vencida
                          ? 'bg-red-500'
                          : 'bg-[#C2AA6A]'
                      )}
                    />
                  ))}
                  {tf.length > 3 && (
                    <div className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                  )}
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}