'use client'

import { useDroppable } from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { type Lead } from '@/types/leads'
import { KanbanCard } from './KanbanCard'
import { useLeadsPorFase } from '@/hooks/leads/useLeads'
import { usePermissao } from '@/hooks/auth/usePermissao'
import { type TarefaStatusLead } from '@/hooks/leads/useLeadsTarefasStatus'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'

interface Props {
  faseId: string
  faseNome: string
  faseCor: string
  onCriarLead: (faseId: string) => void
  onAbrirLead: (id: string) => void
  tarefasStatus: Map<string, TarefaStatusLead>
  responsavelId?: string
}

export function KanbanColuna({ faseId, faseNome, faseCor, onCriarLead, onAbrirLead, tarefasStatus, responsavelId }: Props) {
  const { data: leads = [], isLoading, isError } = useLeadsPorFase(faseId, responsavelId)
  const { pode } = usePermissao()

  const { setNodeRef, isOver } = useDroppable({ id: faseId })

  return (
    <div className="flex w-[82vw] max-w-[21rem] shrink-0 flex-col sm:w-64 lg:w-52">
      {/* Cabeçalho da coluna */}
      <div className="flex items-center justify-between mb-2 px-0.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <div
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: faseCor }}
          />
          <span className="text-xs font-semibold text-fonti-primary truncate">
            {faseNome}
          </span>
          <span className="text-xs text-gray-400 font-normal shrink-0">
            {leads.length}
          </span>
        </div>

        {pode('leads.criar') && (
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-gray-400 hover:text-fonti-primary shrink-0"
            onClick={() => onCriarLead(faseId)}
          >
            <Plus className="h-3 w-3" />
          </Button>
        )}
      </div>

      {/* Área droppable */}
      <SortableContext
        id={faseId}
        items={leads.map((l) => l.id)}
        strategy={verticalListSortingStrategy}
      >
        <div
          ref={setNodeRef}
          className={`
            flex min-h-[80px] flex-col gap-1.5 rounded-lg p-1.5 transition-colors
            ${isOver ? 'bg-fonti-accent-hover/60 ring-1 ring-fonti-accent' : 'bg-gray-100/60'}
          `}
        >
          {isLoading ? (
            <div className="space-y-1.5">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="animate-pulse bg-gray-200 rounded-lg h-16" />
              ))}
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center h-16 gap-1 text-xs text-red-400">
              <span>Erro ao carregar leads.</span>
            </div>
          ) : leads.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-16 gap-1 text-xs text-gray-400">
              <span>Nenhum lead ainda.</span>
              {pode('leads.criar') && (
                <button
                  onClick={() => onCriarLead(faseId)}
                  className="text-fonti-accent hover:underline"
                >
                  Adicionar o primeiro →
                </button>
              )}
            </div>
          ) : (
            leads.map((lead) => (
              <KanbanCard
                key={lead.id}
                lead={lead}
                onAbrirLead={onAbrirLead}
                tarefaStatus={tarefasStatus.get(lead.id)}
              />
            ))
          )}
        </div>
      </SortableContext>
    </div>
  )
}
