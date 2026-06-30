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
import { ModalConcluirLead } from './ModalConcluirLead'
import { NovoProcessoModal } from './NovoProcessoModal'
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

interface PendenteConclusao {
  leadId: string
  faseDestinoId: string
  lead: Lead
}

export function KanbanBoard({ onCriarLead, onAbrirLead }: Props) {
  const { data: todasFases = [] } = useFases('leads')
  const moverLead = useMoverLeadKanban()
  const tarefasStatus = useLeadsTarefasStatus()
  const [leadAtivo, setLeadAtivo] = useState<Lead | null>(null)
  const [mostrarConcluidos, setMostrarConcluidos] = useState(false)
  const [pendenteConclusao, setPendenteConclusao] = useState<PendenteConclusao | null>(null)
  const [novoProcessoLead, setNovoProcessoLead] = useState<Lead | null>(null)
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

      // Verifica bloqueadores em todas as fases entre origem e destino (inclusive origem, exclusive destino)
      if (faseOrigemId && faseDestinoId && faseDestinoId !== faseOrigemId) {
        const faseOrigem  = todasFases.find(f => f.id === faseOrigemId)
        const faseDestino = todasFases.find(f => f.id === faseDestinoId)

        if (faseOrigem && faseDestino && faseDestino.ordem > faseOrigem.ordem) {
          // Todas as fases do range [origem, destino)
          const fasesNoRange = todasFases
            .filter(f => f.ordem >= faseOrigem.ordem && f.ordem < faseDestino.ordem)
            .sort((a, b) => a.ordem - b.ordem)

          for (const fase of fasesNoRange) {
            const { data: template } = await supabase
              .from('checklist_templates')
              .select('id')
              .eq('fase_id', fase.id)
              .eq('empresa_id', usuario!.empresa_id)
              .maybeSingle()

            if (!template) continue

            const { data: itens } = await supabase
              .from('checklist_items')
              .select('id, descricao')
              .eq('template_id', template.id)
              .eq('bloqueia_avanco', true)
              .eq('ativo', true)

            if (!itens || itens.length === 0) continue

            const itemIds = itens.map(i => i.id)
            const { data: execucoes } = await supabase
              .from('checklist_execucoes')
              .select('item_id, marcado')
              .eq('lead_id', leadId)
              .in('item_id', itemIds)

            const concluidos = new Set(execucoes?.filter(e => e.marcado).map(e => e.item_id) ?? [])
            const bloqueadores = itens.filter(i => !concluidos.has(i.id))

            if (bloqueadores.length > 0) {
              toast.error(`Checklist pendente — ${fase.nome}`, {
                description: `Conclua antes de avançar: ${bloqueadores.map(b => b.descricao).join(', ')}`,
              })
              return
            }
          }
        }
      }

      // Se o destino é "Concluído" e vem de outra fase, abrir modal de decisão
      const faseDestino = todasFases.find(f => f.id === faseDestinoId)
      const faseOrigem  = todasFases.find(f => f.id === faseOrigemId)
      if (
        faseDestino?.nome === FASE_CONCLUIDO &&
        faseOrigem?.nome !== FASE_CONCLUIDO &&
        lead
      ) {
        // Move primeiro, depois pergunta
        moverLead.mutate({ lead_id: leadId, fase_id_destino: faseDestinoId, ordem_destino: 0 })
        setPendenteConclusao({ leadId, faseDestinoId, lead })
        return
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
      <div className="flex min-h-[calc(100dvh_/_0.8_-_220px)] gap-3 pb-4 md:min-h-[calc(100dvh_/_0.8_-_200px)]">
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
                  ? 'border-fonti-primary/40 text-fonti-primary bg-fonti-accent-hover/40'
                  : 'border-gray-300 text-gray-400 hover:text-fonti-primary hover:border-fonti-primary/30'}
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

      {pendenteConclusao && (
        <ModalConcluirLead
          aberto={!!pendenteConclusao}
          lead={{
            id:             pendenteConclusao.lead.id,
            nome:           pendenteConclusao.lead.nome,
            empresa_id:     pendenteConclusao.lead.empresa_id,
            responsavel_id: pendenteConclusao.lead.responsavel_id,
          }}
          onCriarProcesso={() => {
            setNovoProcessoLead(pendenteConclusao.lead)
            setPendenteConclusao(null)
          }}
          onAindaNao={() => setPendenteConclusao(null)}
          onFechar={() => setPendenteConclusao(null)}
        />
      )}

      {novoProcessoLead && (
        <NovoProcessoModal
          aberto={!!novoProcessoLead}
          onFechar={() => setNovoProcessoLead(null)}
          lead={novoProcessoLead}
        />
      )}
    </DndContext>
  )
}
