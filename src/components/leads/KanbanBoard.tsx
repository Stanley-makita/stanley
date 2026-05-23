'use client'

import { useState, useCallback } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { type Lead } from '@/types/leads'
import { KanbanColuna } from './KanbanColuna'
import { KanbanCard } from './KanbanCard'
import { useMoverLeadKanban } from '@/hooks/leads/useMoverLeadKanban'
import { useFases } from '@/hooks/configuracoes/useFases'
import { useLeadsTarefasStatus } from '@/hooks/leads/useLeadsTarefasStatus'
import { Button } from '@/components/ui/button'
import { CheckCircle2 } from 'lucide-react'

const FASE_CONCLUIDO = 'Concluído'

interface Props {
  onCriarLead: (faseId: string) => void
  onAbrirLead: (id: string) => void
}

export function KanbanBoard({ onCriarLead, onAbrirLead }: Props) {
  const { data: todasFases = [] } = useFases('leads')
  const moverLead = useMoverLeadKanban()
  const tarefasStatus = useLeadsTarefasStatus()
  const [leadAtivo, setLeadAtivo] = useState<Lead | null>(null)
  const [mostrarConcluidos, setMostrarConcluidos] = useState(false)

  const fases = mostrarConcluidos
    ? todasFases
    : todasFases.filter((f) => f.nome !== FASE_CONCLUIDO)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 }, // 8px para evitar clique acidental
    })
  )

  const onDragStart = useCallback((event: DragStartEvent) => {
    const lead = event.active.data.current?.lead as Lead | undefined
    if (lead) setLeadAtivo(lead)
  }, [])

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      setLeadAtivo(null)
      const { active, over } = event

      if (!over) return

      const leadId = active.id as string

      // over.id pode ser um faseId (solto na área vazia da coluna)
      // ou um leadId (solto sobre outro card) — nesse caso usamos o containerId do SortableContext
      const overId = over.id as string
      const ehFase = fases.some((f) => f.id === overId)
      const faseDestinoId = ehFase
        ? overId
        : (over.data.current?.sortable?.containerId as string | undefined) ?? overId

      // Não mover se for para a mesma fase E mesmo card
      if (leadId === overId && ehFase === false) return

      moverLead.mutate({
        lead_id: leadId,
        fase_id_destino: faseDestinoId,
        ordem_destino: 0,
      })
    },
    [moverLead, fases]
  )

  const temConcluido = todasFases.some((f) => f.nome === FASE_CONCLUIDO)

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="flex gap-3 pb-4 min-h-[calc(100vh-200px)]">
        {fases.map((fase) => (
          <KanbanColuna
            key={fase.id}
            faseId={fase.id}
            faseNome={fase.nome}
            faseCor={fase.cor ?? '#94a3b8'}
            onCriarLead={onCriarLead}
            onAbrirLead={onAbrirLead}
            tarefasStatus={tarefasStatus}
          />
        ))}

        {/* Botão para revelar/ocultar a coluna Concluído */}
        {temConcluido && (
          <div className="flex flex-col justify-start pt-0 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMostrarConcluidos((v) => !v)}
              className={`
                h-8 text-xs gap-1.5 rounded-lg px-3 border border-dashed transition-colors
                ${mostrarConcluidos
                  ? 'border-[#253B29]/40 text-[#253B29] bg-[#E7E0C4]/40'
                  : 'border-gray-300 text-gray-400 hover:text-[#253B29] hover:border-[#253B29]/30'}
              `}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {mostrarConcluidos ? 'Ocultar concluídos' : 'Ver concluídos'}
            </Button>
          </div>
        )}
      </div>

      <DragOverlay>
        {leadAtivo && <KanbanCard lead={leadAtivo} overlay onAbrirLead={onAbrirLead} />}
      </DragOverlay>
    </DndContext>
  )
}