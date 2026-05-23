'use client'

import { useMemo } from 'react'
import { isSameDay, isToday, isBefore, parseISO } from 'date-fns'
import { TarefaAgenda, PrioridadeTarefa } from '@/types/agenda'
import { TarefaCard } from './TarefaCard'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type FiltroStatus = 'pendentes' | 'concluidas' | 'todas'

interface ListaAgendaProps {
  tarefas: TarefaAgenda[]
  diaSelecionado: Date | null
  filtroStatus: FiltroStatus
  filtroPrioridade: PrioridadeTarefa | 'todas'
  onFiltroStatusChange: (v: FiltroStatus) => void
  onFiltroPrioridadeChange: (v: PrioridadeTarefa | 'todas') => void
  onToggle: (id: string, concluida: boolean) => void
}

export function ListaAgenda({
  tarefas,
  diaSelecionado,
  filtroStatus,
  filtroPrioridade,
  onFiltroStatusChange,
  onFiltroPrioridadeChange,
  onToggle,
}: ListaAgendaProps) {
  const filtradas = useMemo(() => {
    return tarefas.filter((t) => {
      if (diaSelecionado && t.tarefa_vencimento) {
        if (!isSameDay(parseISO(t.tarefa_vencimento), diaSelecionado)) return false
      }
      if (filtroStatus === 'pendentes' && t.concluida) return false
      if (filtroStatus === 'concluidas' && !t.concluida) return false
      if (filtroPrioridade !== 'todas' && t.tarefa_prioridade !== filtroPrioridade) return false
      return true
    })
  }, [tarefas, diaSelecionado, filtroStatus, filtroPrioridade])

  const pendentes  = tarefas.filter((t) => !t.concluida).length
  const vencidas   = tarefas.filter((t) => !t.concluida && t.tarefa_vencimento && isBefore(parseISO(t.tarefa_vencimento), new Date()) && !isToday(parseISO(t.tarefa_vencimento))).length
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

      {/* Filtros */}
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
      <div className="space-y-2 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
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