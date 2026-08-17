'use client'

import { useState } from 'react'
import {
  startOfMonth, endOfMonth, eachDayOfInterval, getDay,
  isSameDay, isSameMonth, isToday, format, parseISO,
} from 'date-fns'
import { TarefaAgenda } from '@/types/agenda'
import { cn } from '@/lib/utils'
import { TarefaChip } from '@/components/agenda/TarefaChip'

interface CalendarioMensalCompletoProps {
  mes: Date
  tarefas: TarefaAgenda[]
  onTarefaClick: (tarefaId: string, fonte: 'processo' | 'lead' | 'compromisso') => void
}

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

const MAX_VISIVEIS = 3

/** Visão de calendário mensal completa — cada célula do dia lista os compromissos daquele dia (estilo Google Calendar/Ploomes), em vez de só indicar quantidade como o mini-calendário lateral. */
export function CalendarioMensalCompleto({ mes, tarefas, onTarefaClick }: CalendarioMensalCompletoProps) {
  const inicio = startOfMonth(mes)
  const fim    = endOfMonth(mes)
  const dias   = eachDayOfInterval({ start: inicio, end: fim })

  const offsetInicio = getDay(inicio)
  const celulasVazias = Array.from({ length: offsetInicio })

  function tarefasDoDia(dia: Date): TarefaAgenda[] {
    return tarefas
      // parseISO (não new Date) — tarefa_vencimento é uma data sem hora
      // ("2026-07-18"); new Date() interpretaria como UTC meia-noite, que em
      // fusos negativos (Brasília, UTC-3) vira o dia anterior às 21h local,
      // fazendo a tarefa aparecer um dia adiantada na célula errada.
      .filter((t) => t.tarefa_vencimento && isSameDay(parseISO(t.tarefa_vencimento), dia))
      // Não concluídas primeiro, depois por prioridade — as mais relevantes
      // aparecem antes de um eventual corte no "+N mais".
      .sort((a, b) => Number(a.concluida) - Number(b.concluida))
  }

  return (
    <div className="rounded-lg border bg-white p-3 sm:p-4">
      {/* Cabeçalho dias da semana */}
      <div className="grid grid-cols-7 mb-1">
        {DIAS_SEMANA.map((d) => (
          <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Grade de dias */}
      <div className="grid grid-cols-7 gap-1">
        {celulasVazias.map((_, i) => (
          <div key={`vazio-${i}`} className="min-h-[110px]" />
        ))}

        {dias.map((dia) => (
          <DiaCelula
            key={dia.toISOString()}
            dia={dia}
            mesAtual={isSameMonth(dia, mes)}
            hoje={isToday(dia)}
            tarefas={tarefasDoDia(dia)}
            onTarefaClick={onTarefaClick}
          />
        ))}
      </div>
    </div>
  )
}

function DiaCelula({
  dia, mesAtual, hoje, tarefas, onTarefaClick,
}: {
  dia: Date
  mesAtual: boolean
  hoje: boolean
  tarefas: TarefaAgenda[]
  onTarefaClick: (tarefaId: string, fonte: 'processo' | 'lead' | 'compromisso') => void
}) {
  const [expandido, setExpandido] = useState(false)

  const visiveis = expandido ? tarefas : tarefas.slice(0, MAX_VISIVEIS)
  const restantes = tarefas.length - visiveis.length

  return (
    <div
      className={cn(
        'min-h-[110px] rounded-lg border border-transparent p-1.5 flex flex-col gap-1',
        mesAtual ? 'hover:border-gray-200' : 'opacity-30',
      )}
    >
      <span className={cn(
        'text-xs font-medium leading-none w-5 h-5 flex items-center justify-center rounded-full shrink-0',
        hoje ? 'bg-fonti-primary text-white' : 'text-gray-600',
      )}>
        {format(dia, 'd')}
      </span>

      <div className="flex flex-col gap-0.5">
        {visiveis.map((t) => (
          <TarefaChip key={t.tarefa_id} tarefa={t} onClick={onTarefaClick} />
        ))}

        {restantes > 0 && (
          <button
            onClick={() => setExpandido(true)}
            className="text-[11px] text-gray-400 hover:text-fonti-primary text-left px-1.5"
          >
            +{restantes} mais
          </button>
        )}

        {expandido && tarefas.length > MAX_VISIVEIS && (
          <button
            onClick={() => setExpandido(false)}
            className="text-[11px] text-gray-400 hover:text-fonti-primary text-left px-1.5"
          >
            ver menos
          </button>
        )}
      </div>
    </div>
  )
}
