'use client'

import { useState, useRef, useEffect } from 'react'
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy,
  arrayMove, useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Plus, GripVertical, Pencil, Trash2, Check, X, Loader2,
} from 'lucide-react'
import {
  useFases, useReordenarFases, useExcluirFase, useAtualizarFase,
  MODULOS_FASES, type ModuloFase,
} from '../../_hooks/useFases'
import { FaseFormDrawer } from './FaseForm'
import { cn } from '@/lib/utils'
import type { Fase } from '@/types/configuracoes'
import { toast } from 'sonner'

export function FasesLista() {
  const [moduloAtivo, setModuloAtivo] = useState<ModuloFase>('leads')
  const [faseSelecionada, setFaseSelecionada] = useState<Fase | null>(null)
  const [drawerAberto, setDrawerAberto] = useState(false)
  const [confirmandoExclusao, setConfirmandoExclusao] = useState<string | null>(null)

  const { data: fases, isLoading, error } = useFases(moduloAtivo)
  const reordenar = useReordenarFases()
  const excluir   = useExcluirFase()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function abrirNova() {
    setFaseSelecionada(null)
    setDrawerAberto(true)
  }

  function abrirEditar(fase: Fase) {
    setFaseSelecionada(fase)
    setDrawerAberto(true)
  }

  function handleExcluir(id: string) {
    if (confirmandoExclusao === id) {
      excluir.mutate(id, {
        onSuccess: () => toast.success('Fase excluída.'),
        onError: () => toast.error('Não foi possível excluir a fase.'),
      })
      setConfirmandoExclusao(null)
    } else {
      setConfirmandoExclusao(id)
      setTimeout(() => setConfirmandoExclusao(null), 3000)
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id || !fases) return

    const oldIndex = fases.findIndex((f) => f.id === active.id)
    const newIndex = fases.findIndex((f) => f.id === over.id)
    const reordenadas = arrayMove(fases, oldIndex, newIndex)

    reordenar.mutate(reordenadas.map((f, i) => ({ id: f.id, ordem: i + 1 })))
  }

  const moduloInfo = MODULOS_FASES.find(m => m.id === moduloAtivo)

  return (
    <div className="space-y-5">

      {/* Seletor de módulo */}
      <div className="flex gap-2 flex-wrap">
        {MODULOS_FASES.map((m) => (
          <button
            key={m.id}
            onClick={() => setModuloAtivo(m.id as ModuloFase)}
            className={cn(
              'flex flex-col items-start px-4 py-2.5 rounded-xl border text-left transition-all',
              moduloAtivo === m.id
                ? 'border-[#253B29] bg-[#253B29] text-white shadow-sm'
                : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
            )}
          >
            <span className="text-sm font-semibold">{m.label}</span>
            <span className={cn(
              'text-xs mt-0.5',
              moduloAtivo === m.id ? 'text-white/70' : 'text-gray-400'
            )}>
              {m.descricao}
            </span>
          </button>
        ))}
      </div>

      {/* Cabeçalho */}
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-500">
          {isLoading ? '...' : `${fases?.length ?? 0} fases em ${moduloInfo?.label}`}
        </p>
        <Button
          onClick={abrirNova}
          size="sm"
          className="bg-[#253B29] hover:bg-[#C2AA6A] hover:text-[#253B29] text-white"
        >
          <Plus className="w-4 h-4 mr-1" /> Nova fase
        </Button>
      </div>

      {/* Estados */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-14 rounded-lg bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <p className="text-red-600 text-sm">Não foi possível carregar as fases. Tente novamente.</p>
      ) : !fases?.length ? (
        <div className="text-center py-12 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
          <p className="text-sm mb-1">Nenhuma fase em <strong className="text-gray-600">{moduloInfo?.label}</strong></p>
          <p className="text-xs text-gray-400 mb-4">{moduloInfo?.descricao}</p>
          <Button
            onClick={abrirNova}
            size="sm"
            className="bg-[#253B29] hover:bg-[#C2AA6A] hover:text-[#253B29] text-white"
          >
            <Plus className="w-4 h-4 mr-1" /> Criar primeira fase
          </Button>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={fases.map((f) => f.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {fases.map((fase) => (
                <FaseItem
                  key={fase.id}
                  fase={fase}
                  confirmandoExclusao={confirmandoExclusao === fase.id}
                  onEditar={() => abrirEditar(fase)}
                  onExcluir={() => handleExcluir(fase.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <FaseFormDrawer
        aberto={drawerAberto}
        onFechar={() => setDrawerAberto(false)}
        fase={faseSelecionada}
        moduloInicial={moduloAtivo}
      />
    </div>
  )
}

// ── Item arrastável com edição inline de nome ────────────────

function FaseItem({ fase, confirmandoExclusao, onEditar, onExcluir }: {
  fase: Fase
  confirmandoExclusao: boolean
  onEditar: () => void
  onExcluir: () => void
}) {
  const atualizar = useAtualizarFase()
  const [editandoNome, setEditandoNome] = useState(false)
  const [nomeTemp, setNomeTemp] = useState(fase.nome)
  const inputRef = useRef<HTMLInputElement>(null)

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: fase.id })

  const style = { transform: CSS.Transform.toString(transform), transition }

  useEffect(() => {
    if (editandoNome) {
      setNomeTemp(fase.nome)
      setTimeout(() => inputRef.current?.select(), 50)
    }
  }, [editandoNome, fase.nome])

  async function salvarNome() {
    const nome = nomeTemp.trim()
    if (!nome || nome === fase.nome) { setEditandoNome(false); return }
    await atualizar.mutateAsync({ id: fase.id, nome })
    setEditandoNome(false)
    toast.success('Nome atualizado.')
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-3 p-3 bg-white border rounded-lg shadow-sm transition-all group',
        isDragging
          ? 'opacity-50 border-[#C2AA6A] shadow-md'
          : 'border-gray-100 hover:shadow-md hover:border-gray-200'
      )}
    >
      <button
        {...attributes} {...listeners}
        className="touch-none cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 shrink-0"
        tabIndex={-1}
      >
        <GripVertical className="w-4 h-4" />
      </button>

      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: fase.cor ?? '#C2AA6A' }} />

      <div className="flex-1 min-w-0">
        {editandoNome ? (
          <div className="flex items-center gap-1.5">
            <Input
              ref={inputRef}
              value={nomeTemp}
              onChange={e => setNomeTemp(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') salvarNome()
                if (e.key === 'Escape') { setNomeTemp(fase.nome); setEditandoNome(false) }
              }}
              className="h-7 text-sm py-0 px-2"
            />
            <button onClick={salvarNome} disabled={atualizar.isPending}
              className="p-1 rounded text-green-600 hover:bg-green-50">
              {atualizar.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            </button>
            <button onClick={() => { setNomeTemp(fase.nome); setEditandoNome(false) }}
              className="p-1 rounded text-gray-400 hover:bg-gray-100">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <p
            className="text-sm font-medium text-gray-900 cursor-text"
            onDoubleClick={() => setEditandoNome(true)}
            title="Clique duplo para editar o nome"
          >
            {fase.nome}
          </p>
        )}
        {fase.prazo_dias != null && (
          <p className="text-xs text-gray-400">SLA: {fase.prazo_dias} dias</p>
        )}
      </div>

      {!editandoNome && (
        <div className={cn(
          'flex gap-1 shrink-0 transition-opacity',
          confirmandoExclusao ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        )}>
          <Button variant="ghost" size="icon"
            className="h-7 w-7 text-blue-500 hover:text-blue-700 hover:bg-blue-50"
            onClick={onEditar} title="Editar cor, SLA e notificações">
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="icon"
            className={cn('h-7 w-7 transition-colors',
              confirmandoExclusao
                ? 'bg-red-500 text-white hover:bg-red-600'
                : 'text-red-400 hover:text-red-600 hover:bg-red-50'
            )}
            onClick={onExcluir}
            title={confirmandoExclusao ? 'Confirmar exclusão' : 'Excluir fase'}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}
    </div>
  )
}
