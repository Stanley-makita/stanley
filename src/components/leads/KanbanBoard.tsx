'use client'

import { useState, useCallback, useEffect } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { useQueryClient } from '@tanstack/react-query'
import { type Lead } from '@/types/leads'
import { KanbanColuna } from './KanbanColuna'
import { KanbanCard } from './KanbanCard'
import { useMoverLeadKanban } from '@/hooks/leads/useMoverLeadKanban'
import { useFases } from '@/hooks/configuracoes/useFases'
import { useLeadsTarefasStatus } from '@/hooks/leads/useLeadsTarefasStatus'
import { useAuth } from '@/hooks/auth/useAuth'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'

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
  const queryClient = useQueryClient()
  const { usuario } = useAuth()

  useEffect(() => {
    if (!usuario?.empresa_id) return
    const channel = supabase
      .channel('kanban-leads')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'leads', filter: `empresa_id=eq.${usuario.empresa_id}` },
        () => queryClient.invalidateQueries({ queryKey: ['leads', 'fase'] }),
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [usuario?.empresa_id, queryClient])

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
    async (event: DragEndEvent) => {
      setLeadAtivo(null)
      const { active, over } = event

      if (!over) return

      const leadId = active.id as string
      const lead = active.data.current?.lead as Lead | undefined

      // over.id pode ser um faseId (solto na área vazia da coluna)
      // ou um leadId (solto sobre outro card) — nesse caso usamos o containerId do SortableContext
      const overId = over.id as string
      const ehFaseDestino = todasFases.some((f) => f.id === overId)
      const faseDestinoId = ehFaseDestino
        ? overId
        : (over.data.current?.sortable?.containerId as string | undefined) ?? overId

      // Não mover se for para a mesma fase E mesmo card
      if (leadId === overId && ehFaseDestino === false) return

      // Fase de origem: usa o containerId do SortableContext (mais confiável que lead.fase_id)
      const faseOrigemId =
        (active.data.current?.sortable?.containerId as string | undefined) ??
        lead?.fase_id

      // Verifica bloqueadores do checklist ao avançar de fase
      if (faseOrigemId && faseDestinoId && faseDestinoId !== faseOrigemId) {
        const faseOrigem  = todasFases.find(f => f.id === faseOrigemId)
        const faseDestino = todasFases.find(f => f.id === faseDestinoId)

        if (faseOrigem && faseDestino && faseDestino.ordem > faseOrigem.ordem) {
          // Busca template da fase de origem
          const { data: template } = await supabase
            .from('checklist_templates')
            .select('id')
            .eq('fase_id', faseOrigemId)
            .eq('empresa_id', usuario!.empresa_id)
            .maybeSingle()

          if (template) {
            const { data: itens } = await supabase
              .from('checklist_items')
              .select('id, descricao')
              .eq('template_id', template.id)
              .eq('bloqueia_avanco', true)
              .eq('ativo', true)

            if (itens && itens.length > 0) {
              const itemIds = itens.map(i => i.id)
              const { data: execucoes } = await supabase
                .from('checklist_execucoes')
                .select('item_id, marcado')
                .eq('lead_id', leadId)
                .in('item_id', itemIds)

              const concluidos = new Set(execucoes?.filter(e => e.marcado).map(e => e.item_id) ?? [])
              const bloqueadores = itens.filter(i => !concluidos.has(i.id))

              if (bloqueadores.length > 0) {
                toast.error('Checklist obrigatório pendente', {
                  description: `Conclua antes de avançar: ${bloqueadores.map(b => b.descricao).join(', ')}`,
                })
                return
              }
            }
          }
        }
      }

      moverLead.mutate({
        lead_id: leadId,
        fase_id_destino: faseDestinoId,
        ordem_destino: 0,
      })
    },
    [moverLead, todasFases, usuario]
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