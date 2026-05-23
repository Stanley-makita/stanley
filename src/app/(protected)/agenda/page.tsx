'use client'

import { useState, useCallback } from 'react'
import { format, addMonths, subMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAgendaTarefas } from '@/hooks/useAgendaTarefas'
import { useUsuarioAtual } from '@/hooks/useUsuarioAtual'
import { useUsuariosEmpresa } from '@/hooks/useUsuariosEmpresa'
import { useConcluirTarefa } from '@/hooks/useConcluirTarefa'
import { CalendarioMensal } from '@/components/agenda/CalendarioMensal'
import { ListaAgenda } from '@/components/agenda/ListaAgenda'
import { PrioridadeTarefa } from '@/types/agenda'
import { useQueryClient } from '@tanstack/react-query'

export default function AgendaPage() {
  const { data: usuario } = useUsuarioAtual()
  const { data: membros = [] } = useUsuariosEmpresa()
  const queryClient = useQueryClient()

  const podeVerTodos = usuario?.perfil === 'admin' || usuario?.perfil === 'gerente'

  const [mes, setMes] = useState(new Date())
  const [diaSelecionado, setDiaSelecionado] = useState<Date | null>(null)
  const [filtroResponsavel, setFiltroResponsavel] = useState<string>(
    podeVerTodos ? 'todos' : (usuario?.id ?? 'todos')
  )
  const [filtroStatus, setFiltroStatus] = useState<'pendentes' | 'concluidas' | 'todas'>('pendentes')
  const [filtroPrioridade, setFiltroPrioridade] = useState<PrioridadeTarefa | 'todas'>('todas')

  const responsavelId = filtroResponsavel === 'todos' ? undefined : filtroResponsavel

  const { data: tarefas = [], isLoading } = useAgendaTarefas(mes, responsavelId)
  const { mutate: concluirTarefa } = useConcluirTarefa()

  const handleToggle = useCallback((tarefaId: string, concluida: boolean) => {
    if (concluida) {
      concluirTarefa(tarefaId, {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agenda-tarefas'] }),
      })
    }
  }, [concluirTarefa, queryClient])

  function handleDiaClick(dia: Date) {
    setDiaSelecionado((prev) => (prev && dia.toDateString() === prev.toDateString() ? null : dia))
  }

  return (
    <div className="p-6 space-y-4">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#253B29]">Agenda</h1>
          <p className="text-sm text-gray-500 mt-0.5">Tarefas de todos os processos</p>
        </div>

        {/* Filtro de responsável — apenas para admin/gerente */}
        {podeVerTodos && (
          <Select value={filtroResponsavel} onValueChange={setFiltroResponsavel}>
            <SelectTrigger className="w-48 h-9 text-sm">
              <SelectValue placeholder="Responsável" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Toda a equipe</SelectItem>
              {membros.map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Layout 2 colunas */}
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
        {/* Coluna esquerda — Calendário */}
        <div className="bg-white rounded-lg border p-4 space-y-3 h-fit">
          {/* Navegação de mês */}
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setMes(subMonths(mes, 1))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm font-semibold text-[#253B29] capitalize">
              {format(mes, 'MMMM yyyy', { locale: ptBR })}
            </span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setMes(addMonths(mes, 1))}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          <CalendarioMensal
            mes={mes}
            tarefas={tarefas}
            diaSelecionado={diaSelecionado}
            onDiaClick={handleDiaClick}
          />

          {diaSelecionado && (
            <button
              onClick={() => setDiaSelecionado(null)}
              className="w-full text-xs text-center text-gray-400 hover:text-gray-600"
            >
              Limpar seleção
            </button>
          )}
        </div>

        {/* Coluna direita — Lista */}
        <div className="bg-white rounded-lg border p-4">
          {isLoading ? (
            <div className="py-12 text-center text-gray-400">Carregando...</div>
          ) : (
            <ListaAgenda
              tarefas={tarefas}
              diaSelecionado={diaSelecionado}
              filtroStatus={filtroStatus}
              filtroPrioridade={filtroPrioridade}
              onFiltroStatusChange={setFiltroStatus}
              onFiltroPrioridadeChange={setFiltroPrioridade}
              onToggle={handleToggle}
            />
          )}
        </div>
      </div>
    </div>
  )
}