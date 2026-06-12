'use client'

import { useState, useEffect } from 'react'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, LayoutTemplate, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/auth/useAuth'
import { useConfigAbas, useSalvarConfigAbas, ABAS_DEFAULT, type AbaConfig } from '@/hooks/leads/useConfigAbas'
import { cn } from '@/lib/utils'

export function AbasConfigTab() {
  const { usuario } = useAuth()
  const abas = useConfigAbas()
  const salvar = useSalvarConfigAbas()
  const [ordem, setOrdem] = useState<AbaConfig[]>(abas)

  useEffect(() => {
    setOrdem(abas)
  }, [abas])

  const isAdmin = usuario?.perfil === 'admin' || usuario?.perfil === 'gestor'

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-400">
        <Lock className="h-8 w-8" />
        <p className="text-sm">Acesso restrito a administradores.</p>
      </div>
    )
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = ordem.findIndex(a => a.id === active.id)
    const newIndex = ordem.findIndex(a => a.id === over.id)
    setOrdem(arrayMove(ordem, oldIndex, newIndex))
  }

  const hasChanges = JSON.stringify(ordem.map(a => a.id)) !== JSON.stringify(abas.map(a => a.id))

  return (
    <div className="max-w-sm">
      <div className="flex items-center gap-2 mb-1">
        <LayoutTemplate className="h-4 w-4 text-[#C2AA6A]" />
        <h3 className="text-sm font-semibold text-[#253B29]">Ordem das abas — Modal de Lead</h3>
      </div>
      <p className="text-xs text-gray-500 mb-5">
        Arraste para reordenar. A ordem é salva por empresa e aplicada a todos os usuários.
      </p>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={ordem.map(a => a.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-1.5">
            {ordem.map((aba, idx) => (
              <AbaItem key={aba.id} aba={aba} posicao={idx + 1} />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <div className="flex items-center gap-3 mt-5 pt-4 border-t border-gray-100">
        <Button
          className="bg-[#253B29] hover:bg-[#1a2b1e] text-white h-8 text-xs px-4"
          disabled={!hasChanges || salvar.isPending}
          onClick={() => salvar.mutate(ordem)}
        >
          {salvar.isPending ? 'Salvando...' : 'Salvar ordem'}
        </Button>
        {hasChanges && (
          <button
            onClick={() => setOrdem(abas)}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            Desfazer
          </button>
        )}
      </div>
    </div>
  )
}

function AbaItem({ aba, posicao }: { aba: AbaConfig; posicao: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: aba.id })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 rounded-lg border bg-white select-none',
        isDragging ? 'border-[#C2AA6A] shadow-md opacity-80' : 'border-gray-200 hover:border-gray-300',
      )}
    >
      <button
        {...attributes}
        {...listeners}
        className="text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing touch-none"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-[10px] font-bold text-gray-400 shrink-0">
        {posicao}
      </span>
      <span className="text-sm text-gray-700 font-medium">{aba.label}</span>
    </div>
  )
}
