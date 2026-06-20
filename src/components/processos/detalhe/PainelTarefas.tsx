'use client'

import { useState } from 'react'
import { useProcessoTarefas, useConcluirTarefa, useCriarTarefa } from '@/hooks/processos/useProcessoTarefas'
import { type ProcessoTarefa } from '@/types/processos'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CheckSquare, Plus, AlertTriangle, Clock } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { fmtData } from '@/lib/utils'
import { TarefaDetalheModal } from '@/components/tarefas/TarefaDetalheModal'

const PRIORIDADE_CONFIG: Record<ProcessoTarefa['prioridade'], { label: string; className: string; icone: React.ElementType }> = {
  urgente: { label: 'Urgente', className: 'text-red-800 bg-red-100',   icone: AlertTriangle },
  alta:    { label: 'Alta',    className: 'text-red-600 bg-red-50',    icone: AlertTriangle },
  media:   { label: 'Média',   className: 'text-amber-600 bg-amber-50', icone: Clock },
  baixa:   { label: 'Baixa',   className: 'text-gray-500 bg-gray-50',   icone: Clock },
}

interface Props { processoId: string; onNovaTarefa?: () => void }

export function PainelTarefas({ processoId, onNovaTarefa }: Props) {
  const { data: tarefas = [] } = useProcessoTarefas(processoId)
  const concluirTarefa = useConcluirTarefa(processoId)
  const [aba, setAba] = useState<'pendente' | 'concluida' | 'todas'>('pendente')
  const [tarefaAbertas, setTarefaAberta] = useState<string | null>(null)

  const tarefasFiltradas = tarefas.filter((t) => {
    if (aba === 'todas') return true
    if (aba === 'pendente') return t.status !== 'concluida'
    return t.status === 'concluida'
  })

  const atrasadas = tarefas.filter((t) =>
    t.data_prazo && new Date(t.data_prazo) < new Date() && t.status !== 'concluida'
  ).length

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <CheckSquare className="h-4 w-4 text-fonti-primary" />
          <span className="text-sm font-semibold text-fonti-primary">Tarefas</span>
          {atrasadas > 0 && (
            <Badge className="bg-red-500 text-white text-xs px-1.5 py-0">
              {atrasadas} atrasada{atrasadas > 1 ? 's' : ''}
            </Badge>
          )}
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6 text-fonti-primary" onClick={() => onNovaTarefa?.()}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Abas */}
      <div className="flex gap-1 mb-3 bg-gray-100 rounded-lg p-0.5">
        {(['pendente', 'concluida', 'todas'] as const).map((a) => {
          const count = tarefas.filter((t) => {
            if (a === 'todas') return true
            if (a === 'pendente') return t.status !== 'concluida'
            return t.status === 'concluida'
          }).length
          return (
            <button
              key={a}
              onClick={() => setAba(a)}
              className={`flex-1 text-xs py-1 rounded-md font-medium transition-colors ${
                aba === a ? 'bg-white text-fonti-primary shadow-sm' : 'text-gray-500'
              }`}
            >
              {a === 'pendente' ? `Pendentes (${count})` : a === 'concluida' ? 'Concluídas' : 'Todas'}
            </button>
          )
        })}
      </div>

      {tarefaAbertas && (
        <TarefaDetalheModal
          tarefaId={tarefaAbertas}
          fonte="processo"
          onFechar={() => setTarefaAberta(null)}
        />
      )}

      {/* Lista */}
      <div className="space-y-2">
        {tarefasFiltradas.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">Nenhuma tarefa.</p>
        ) : (
          tarefasFiltradas.map((t) => {
            const { icone: Icone, className } = PRIORIDADE_CONFIG[t.prioridade]
            const atrasada = t.data_prazo && new Date(t.data_prazo) < new Date() && t.status !== 'concluida'
            return (
              <div
                key={t.id}
                className="flex items-start gap-2 p-2.5 bg-white border border-gray-100 rounded-lg hover:border-fonti-primary/20 cursor-pointer"
                onClick={(e) => {
                  // Não abre modal se clicou no checkbox
                  if ((e.target as HTMLElement).closest('button')) return
                  setTarefaAberta(t.id)
                }}
              >
                <button
                  onClick={(e) => { e.stopPropagation(); t.status !== 'concluida' && concluirTarefa.mutate(t.id) }}
                  className="mt-0.5 shrink-0"
                >
                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                    t.status === 'concluida'
                      ? 'bg-fonti-primary border-fonti-primary'
                      : 'border-gray-300'
                  }`}>
                    {t.status === 'concluida' && (
                      <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 10" fill="none">
                        <path d="M1.5 5L4 7.5L8.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                </button>

                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-medium leading-snug ${t.status === 'concluida' ? 'line-through text-gray-400' : 'text-fonti-primary'}`}>
                    {t.titulo}
                  </p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <Badge className={`text-xs px-1.5 py-0 ${className}`}>
                      {PRIORIDADE_CONFIG[t.prioridade].label}
                    </Badge>
                    {t.responsavel && (
                      <span className="text-xs text-gray-400">{t.responsavel.nome.split(' ')[0]}</span>
                    )}
                    {t.data_prazo && (
                      <span className={`text-xs ${atrasada ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                        {fmtData(t.data_prazo)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}