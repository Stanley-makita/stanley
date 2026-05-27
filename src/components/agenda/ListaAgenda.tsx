'use client'

import { useMemo } from 'react'
import {
  isSameDay, isToday, isBefore, parseISO,
  startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval,
} from 'date-fns'
import { TarefaAgenda, PrioridadeTarefa } from '@/types/agenda'
import { TarefaCard } from './TarefaCard'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

type FiltroStatus  = 'pendentes' | 'concluidas' | 'todas'
export type FiltroPeriodo = 'todos' | 'hoje' | 'semana' | 'mes' | 'vencidas'

interface ListaAgendaProps {
  tarefas: TarefaAgenda[]
  diaSelecionado: Date | null
  filtroStatus: FiltroStatus
  filtroPrioridade: PrioridadeTarefa | 'todas'
  filtroPeriodo: FiltroPeriodo
  onFiltroStatusChange: (v: FiltroStatus) => void
  onFiltroPrioridadeChange: (v: PrioridadeTarefa | 'todas') => void
  onFiltroPeriodoChange: (v: FiltroPeriodo) => void
  onToggle: (id: string, concluida: boolean) => void
}

const PERIODOS: { value: FiltroPeriodo; label: string }[] = [
  { value: 'todos',   label: 'Todos' },
  { value: 'hoje',    label: 'Hoje' },
  { value: 'semana',  label: 'Esta semana' },
  { value: 'mes',     label: 'Este mês' },
  { value: 'vencidas',label: 'Vencidas' },
]

export function ListaAgenda({
  tarefas,
  diaSelecionado,
  filtroStatus,
  filtroPrioridade,
  filtroPeriodo,
  onFiltroStatusChange,
  onFiltroPrioridadeChange,
  onFiltroPeriodoChange,
  onToggle,
}: ListaAgendaProps) {
  const agora = new Date()

  const filtradas = useMemo(() => {
    const inicioSemana = startOfWeek(agora, { weekStartsOn: 1 })
    const fimSemana    = endOfWeek(agora,   { weekStartsOn: 1 })
    const inicioMes    = startOfMonth(agora)
    const fimMes       = endOfMonth(agora)
    const ontem        = new Date(agora); ontem.setDate(ontem.getDate() - 1); ontem.setHours(23, 59, 59, 999)

    return tarefas.filter((t) => {
      // Filtro por dia selecionado no calendário (tem precedência)
      if (diaSelecionado && t.tarefa_vencimento) {
        if (!isSameDay(parseISO(t.tarefa_vencimento), diaSelecionado)) return false
      }

      // Filtro de período (só aplica quando nenhum dia está selecionado)
      if (!diaSelecionado && filtroPeriodo !== 'todos') {
        const venc = t.tarefa_vencimento ? parseISO(t.tarefa_vencimento) : null
        if (filtroPeriodo === 'hoje') {
          if (!venc || !isToday(venc)) return false
        } else if (filtroPeriodo === 'semana') {
          if (!venc || !isWithinInterval(venc, { start: inicioSemana, end: fimSemana })) return false
        } else if (filtroPeriodo === 'mes') {
          if (!venc || !isWithinInterval(venc, { start: inicioMes, end: fimMes })) return false
        } else if (filtroPeriodo === 'vencidas') {
          if (!venc || !isBefore(venc, agora) || isToday(venc)) return false
          if (t.concluida) return false
        }
      }

      if (filtroStatus === 'pendentes' && t.concluida) return false
      if (filtroStatus === 'concluidas' && !t.concluida) return false
      if (filtroPrioridade !== 'todas' && t.tarefa_prioridade !== filtroPrioridade) return false
      return true
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tarefas, diaSelecionado, filtroStatus, filtroPrioridade, filtroPeriodo])

  const pendentes      = tarefas.filter((t) => !t.concluida).length
  const vencidas       = tarefas.filter((t) => !t.concluida && t.tarefa_vencimento && isBefore(parseISO(t.tarefa_vencimento), agora) && !isToday(parseISO(t.tarefa_vencimento))).length
  const concluidasHoje = tarefas.filter((t) => t.concluida && t.concluida_em && isToday(parseISO(t.concluida_em))).length

  return (
    <div className="space-y-3">
      {/* Contadores */}
      <div className="flex gap-4 text-sm">
        <span className="text-gray-600"><strong className="text-[#253B29]">{pendentes}</strong> pendentes</span>
        {vencidas > 0 && (
          <span className="text-red-600 font-semibold">{vencidas} vencidas</span>
        )}
        <span className="text-gray-400">{concluidasHoje} concluídas hoje</span>
      </div>

      {/* Filtro de período */}
      <div className="flex gap-1 flex-wrap">
        {PERIODOS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => onFiltroPeriodoChange(value)}
            className={cn(
              'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
              filtroPeriodo === value
                ? 'bg-[#253B29] text-white border-[#253B29]'
                : 'bg-white text-gray-600 border-gray-200 hover:border-[#253B29]/40'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Filtros status / prioridade */}
      <div className="flex gap-2 flex-wrap">
        <Select value={filtroStatus} onValueChange={(v) => onFiltroStatusChange(v as FiltroStatus)}>
          <SelectTrigger className="h-8 w-36 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pendentes">Pendentes</SelectItem>
            <SelectItem value="concluidas">Concluídas</SelectItem>
            <SelectItem value="todas">Todas</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filtroPrioridade} onValueChange={(v) => onFiltroPrioridadeChange(v as PrioridadeTarefa | 'todas')}>
          <SelectTrigger className="h-8 w-36 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas prioridades</SelectItem>
            <SelectItem value="alta">Alta</SelectItem>
            <SelectItem value="media">Média</SelectItem>
            <SelectItem value="baixa">Baixa</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Lista */}
      <div className="space-y-2 max-h-[calc(100vh-320px)] overflow-y-auto pr-1">
        {filtradas.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-400">
            {diaSelecionado ? 'Nenhuma tarefa neste dia.' : 'Nenhuma tarefa encontrada.'}
          </div>
        ) : (
          filtradas.map((t) => (
            <TarefaCard key={t.tarefa_id} tarefa={t} onToggle={onToggle} />
          ))
        )}
      </div>
    </div>
  )
}
