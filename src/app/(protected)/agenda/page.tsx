'use client'

import { useState, useCallback } from 'react'
import { format, addMonths, subMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAgendaTarefas } from '@/hooks/useAgendaTarefas'
import { useUsuarioAtual } from '@/hooks/useUsuarioAtual'
import { useUsuariosEmpresa } from '@/hooks/useUsuariosEmpresa'
import { useConcluirTarefa } from '@/hooks/useConcluirTarefa'
import { useSolicitacoesFila } from '@/hooks/solicitacoes/useSolicitacoesFila'
import { CalendarioMensal } from '@/components/agenda/CalendarioMensal'
import { ListaAgenda, type FiltroPeriodo } from '@/components/agenda/ListaAgenda'
import { TarefaDetalheModal } from '@/components/tarefas/TarefaDetalheModal'
import { PrioridadeTarefa } from '@/types/agenda'
import { useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import type { PrioridadeSolicitacao, TipoSolicitacao } from '@/types/solicitacoes-operacionais'

const PRIORIDADE_COR: Record<PrioridadeSolicitacao, string> = {
  urgente: 'bg-red-100 text-red-700',
  alta:    'bg-orange-100 text-orange-700',
  normal:  'bg-blue-100 text-blue-700',
  baixa:   'bg-gray-100 text-gray-500',
}

const TIPO_LABEL: Record<TipoSolicitacao, string> = {
  simulacao:          'Simulação',
  analise_credito:    'Análise de crédito',
  reanalise:          'Reanálise',
  engenharia:         'Engenharia',
  custas:             'Custas',
  documentos:         'Documentos',
  formalizacao:       'Formalização',
  registro:           'Registro',
  pendencia:          'Pendência',
  atendimento_cliente:'Atend. cliente',
  outros:             'Outros',
}

export default function AgendaPage() {
  const { data: usuario } = useUsuarioAtual()
  const { data: membros = [] } = useUsuariosEmpresa()
  const queryClient = useQueryClient()

  const podeVerTodos = usuario?.perfil === 'admin' || usuario?.perfil === 'gerente' || usuario?.perfil === 'gestor'
  const isOperacional = usuario?.perfil === 'operacional'

  const [mes, setMes] = useState(new Date())
  const [diaSelecionado, setDiaSelecionado] = useState<Date | null>(null)
  const [filtroResponsavel, setFiltroResponsavel] = useState<string>(
    podeVerTodos ? 'todos' : (usuario?.id ?? 'todos')
  )
  const [filtroStatus, setFiltroStatus] = useState<'pendentes' | 'concluidas' | 'todas'>('pendentes')
  const [filtroPrioridade, setFiltroPrioridade] = useState<PrioridadeTarefa | 'todas'>('todas')
  const [filtroPeriodo, setFiltroPeriodo] = useState<FiltroPeriodo>('todos')
  const [tarefaAberta, setTarefaAberta] = useState<{ id: string; fonte: 'processo' | 'lead' } | null>(null)

  const responsavelId = filtroResponsavel === 'todos' ? undefined : filtroResponsavel

  const { data: tarefas = [], isLoading } = useAgendaTarefas(mes, responsavelId)
  const { mutate: concluirTarefa } = useConcluirTarefa()

  const { data: solicitacoes = [], isLoading: loadingSol } = useSolicitacoesFila({
    todasDaEmpresa: false,
    incluirConcluidas: false,
  })

  const handleToggle = useCallback((tarefaId: string, concluida: boolean, fonte?: 'processo' | 'lead') => {
    if (concluida) {
      concluirTarefa({ tarefaId, fonte }, {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agenda-tarefas'] }),
      })
    }
  }, [concluirTarefa, queryClient])

  function handleDiaClick(dia: Date) {
    setDiaSelecionado((prev) => (prev && dia.toDateString() === prev.toDateString() ? null : dia))
    if (dia) setFiltroPeriodo('todos')
  }

  return (
    <div className="p-6 space-y-4">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#253B29]">Agenda</h1>
          <p className="text-sm text-gray-500 mt-0.5">Tarefas de todos os processos</p>
        </div>

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

      {/* Layout 2 colunas — calendário + lista */}
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
        {/* Coluna esquerda — Calendário */}
        <div className="bg-white rounded-lg border p-4 space-y-3 h-fit">
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
              filtroPeriodo={filtroPeriodo}
              onFiltroStatusChange={setFiltroStatus}
              onFiltroPrioridadeChange={setFiltroPrioridade}
              onFiltroPeriodoChange={setFiltroPeriodo}
              onToggle={handleToggle}
              onDetalhes={(id, fonte) => setTarefaAberta({ id, fonte })}
            />
          )}
        </div>
      </div>

      {tarefaAberta && (
        <TarefaDetalheModal
          tarefaId={tarefaAberta.id}
          fonte={tarefaAberta.fonte}
          onFechar={() => setTarefaAberta(null)}
        />
      )}

      {/* Painel operacional — só para perfil operacional */}
      {isOperacional && (
        <div className="bg-white rounded-lg border p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertCircle className="h-4 w-4 text-[#253B29]" />
            <h2 className="font-semibold text-[#253B29] text-sm">Solicitações operacionais abertas</h2>
            {!loadingSol && (
              <span className="ml-auto text-xs text-gray-400">
                {solicitacoes.length} aberta{solicitacoes.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {loadingSol ? (
            <div className="space-y-2">
              {[1, 2].map((i) => <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />)}
            </div>
          ) : solicitacoes.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Nenhuma solicitação aberta 👍</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {solicitacoes.map((s) => (
                <div key={s.id} className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 border border-gray-100">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{s.titulo}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{TIPO_LABEL[s.tipo]}</p>
                  </div>
                  <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0', PRIORIDADE_COR[s.prioridade])}>
                    {s.prioridade}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
