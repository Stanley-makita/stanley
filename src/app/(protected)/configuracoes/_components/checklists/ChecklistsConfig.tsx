'use client'

import { useState } from 'react'
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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { ChevronDown, ChevronRight, GripVertical, Pencil, Plus, Trash2, Check, X, Loader2, Circle, CircleDot } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  useChecklistTemplates,
  useGarantirTemplate,
  useCriarChecklistItem,
  useAtualizarChecklistItem,
  useExcluirChecklistItem,
  useReordenarChecklistItens,
} from '@/hooks/configuracoes/useChecklistConfig'
import type { ChecklistItemDB } from '@/hooks/processos/useChecklist'

const MODULOS = [
  { id: 'processos',  label: 'Financiamento' },
  { id: 'consorcio',  label: 'Consórcio'     },
  { id: 'contrato',   label: 'Contrato'       },
  { id: 'registro',   label: 'Registro'       },
]

// ── Item arrastável ───────────────────────────────────────────────────────────

function ChecklistItemRow({
  item, modulo, onEditar, onExcluir, confirmandoExclusao, setConfirmandoExclusao,
}: {
  item: ChecklistItemDB
  modulo: string
  onEditar: (item: ChecklistItemDB) => void
  onExcluir: (id: string) => void
  confirmandoExclusao: string | null
  setConfirmandoExclusao: (id: string | null) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id })

  const style = { transform: CSS.Transform.toString(transform), transition }

  function handleExcluir() {
    if (confirmandoExclusao === item.id) {
      onExcluir(item.id)
      setConfirmandoExclusao(null)
    } else {
      setConfirmandoExclusao(item.id)
      setTimeout(() => setConfirmandoExclusao(null), 3000)
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-2 py-2 px-3 rounded-lg border border-gray-100 bg-white group transition-all',
        isDragging && 'opacity-50 border-[#C2AA6A] shadow-md'
      )}
    >
      <button {...attributes} {...listeners} className="text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing shrink-0">
        <GripVertical className="h-4 w-4" />
      </button>
      {item.obrigatorio
        ? <CircleDot className="h-3.5 w-3.5 shrink-0 text-red-500" />
        : <Circle    className="h-3.5 w-3.5 shrink-0 text-gray-300" />
      }
      <span className="flex-1 text-sm text-gray-700 truncate">{item.descricao}</span>
      {item.acao_ao_completar === 'emitido' && (
        <span className="text-[10px] font-medium text-green-600 shrink-0">🎉 Emitido</span>
      )}
      <span className={cn(
        'text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0',
        item.obrigatorio ? 'bg-red-50 text-red-500' : 'bg-gray-100 text-gray-500'
      )}>
        {item.obrigatorio ? 'Obrigatório' : 'Opcional'}
      </span>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={() => onEditar(item)} className="text-gray-400 hover:text-[#253B29] p-1 rounded">
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={handleExcluir}
          className={cn('p-1 rounded transition-colors', confirmandoExclusao === item.id
            ? 'text-red-600 bg-red-50'
            : 'text-gray-400 hover:text-red-500'
          )}
          title={confirmandoExclusao === item.id ? 'Confirmar exclusão' : 'Excluir'}
        >
          {confirmandoExclusao === item.id ? <Check className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  )
}

// ── Formulário inline de item ─────────────────────────────────────────────────

function ItemForm({ onSalvar, onCancelar, inicial }: {
  onSalvar: (descricao: string, obrigatorio: boolean, acao_ao_completar: string | null) => void
  onCancelar: () => void
  inicial?: { descricao: string; obrigatorio: boolean; acao_ao_completar?: string | null }
}) {
  const [descricao, setDescricao] = useState(inicial?.descricao ?? '')
  const [obrigatorio, setObrigatorio] = useState(inicial?.obrigatorio ?? false)
  const [acao, setAcao] = useState(inicial?.acao_ao_completar ?? '')

  function handleSalvar() {
    if (!descricao.trim()) return
    onSalvar(descricao, obrigatorio, acao || null)
  }

  return (
    <div className="border border-[#C2AA6A]/40 rounded-lg p-3 bg-[#E7E0C4]/10 space-y-2">
      <Input
        autoFocus
        placeholder="Descrição do item..."
        value={descricao}
        onChange={(e) => setDescricao(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleSalvar(); if (e.key === 'Escape') onCancelar() }}
        className="h-8 text-sm"
      />
      <div className="flex items-center gap-3 flex-wrap">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={obrigatorio}
            onChange={(e) => setObrigatorio(e.target.checked)}
            className="accent-red-500"
          />
          <span className="text-xs text-gray-600">Obrigatório <span className="text-red-500">*</span></span>
        </label>
        <Select value={acao || 'none'} onValueChange={(v) => setAcao(v === 'none' ? '' : v)}>
          <SelectTrigger className="h-7 text-xs w-52 flex-shrink-0">
            <SelectValue placeholder="Nenhuma ação ao completar" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Nenhuma ação</SelectItem>
            <SelectItem value="emitido">🎉 Marcar como Emitido</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex justify-end gap-1.5">
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onCancelar}>
          <X className="h-3.5 w-3.5 mr-1" /> Cancelar
        </Button>
        <Button
          size="sm"
          className="h-7 text-xs bg-[#253B29] hover:bg-[#1a2b1e] text-white"
          onClick={handleSalvar}
          disabled={!descricao.trim()}
        >
          <Check className="h-3.5 w-3.5 mr-1" /> Salvar
        </Button>
      </div>
    </div>
  )
}

// ── Seção de uma fase ─────────────────────────────────────────────────────────

function FaseSection({
  fase, template, itens, modulo,
}: {
  fase: { id: string; nome: string; cor: string | null; ordem: number }
  template: { id: string } | null
  itens: ChecklistItemDB[]
  modulo: string
}) {
  const [aberta, setAberta] = useState(false)
  const [adicionando, setAdicionando] = useState(false)
  const [editandoItem, setEditandoItem] = useState<ChecklistItemDB | null>(null)
  const [confirmandoExclusao, setConfirmandoExclusao] = useState<string | null>(null)
  const [itensLocais, setItensLocais] = useState<ChecklistItemDB[]>(itens)

  // Sincronizar quando itens externos mudam
  if (JSON.stringify(itensLocais.map(i => i.id)) !== JSON.stringify(itens.map(i => i.id))) {
    setItensLocais(itens)
  }

  const garantirTemplate = useGarantirTemplate()
  const criarItem        = useCriarChecklistItem()
  const atualizarItem    = useAtualizarChecklistItem()
  const excluirItem      = useExcluirChecklistItem()
  const reordenar        = useReordenarChecklistItens()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  async function getOuCriarTemplateId(): Promise<string> {
    if (template) return template.id
    const id = await garantirTemplate.mutateAsync({ faseId: fase.id, nome: fase.nome, modulo })
    return id
  }

  async function handleSalvarNovoItem(descricao: string, obrigatorio: boolean, acao_ao_completar: string | null) {
    const templateId = await getOuCriarTemplateId()
    await criarItem.mutateAsync({
      templateId,
      descricao,
      obrigatorio,
      acao_ao_completar,
      ordem: itensLocais.length,
      modulo,
    })
    setAdicionando(false)
    toast.success('Item adicionado.')
  }

  async function handleSalvarEdicao(descricao: string, obrigatorio: boolean, acao_ao_completar: string | null) {
    if (!editandoItem) return
    await atualizarItem.mutateAsync({ itemId: editandoItem.id, descricao, obrigatorio, acao_ao_completar, modulo })
    setEditandoItem(null)
    toast.success('Item atualizado.')
  }

  async function handleExcluir(itemId: string) {
    await excluirItem.mutateAsync({ itemId, modulo })
    toast.success('Item removido.')
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = itensLocais.findIndex(i => i.id === active.id)
    const newIndex = itensLocais.findIndex(i => i.id === over.id)
    const reordenados = arrayMove(itensLocais, oldIndex, newIndex)
    setItensLocais(reordenados)
    reordenar.mutate({ itens: reordenados.map((i, idx) => ({ id: i.id, ordem: idx })), modulo })
  }

  const corFase = fase.cor ?? '#C2AA6A'

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      {/* Header da fase */}
      <button
        onClick={() => setAberta(!aberta)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-white hover:bg-gray-50 transition-colors"
      >
        {aberta
          ? <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
          : <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
        }
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: corFase }} />
        <span className="text-sm font-medium text-[#253B29] flex-1 text-left">{fase.nome}</span>
        {itens.length > 0 && (
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
            {itens.length} {itens.length === 1 ? 'item' : 'itens'}
          </span>
        )}
      </button>

      {/* Body expansível */}
      {aberta && (
        <div className="px-4 pb-4 pt-1 space-y-2 bg-gray-50/50">
          {itensLocais.length === 0 && !adicionando && (
            <p className="text-xs text-gray-400 text-center py-3">
              Nenhum item configurado para esta fase.
            </p>
          )}

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={itensLocais.map(i => i.id)} strategy={verticalListSortingStrategy}>
              {itensLocais.map(item =>
                editandoItem?.id === item.id ? (
                  <ItemForm
                    key={item.id}
                    inicial={{ descricao: item.descricao, obrigatorio: item.obrigatorio, acao_ao_completar: item.acao_ao_completar }}
                    onSalvar={handleSalvarEdicao}
                    onCancelar={() => setEditandoItem(null)}
                  />
                ) : (
                  <ChecklistItemRow
                    key={item.id}
                    item={item}
                    modulo={modulo}
                    onEditar={setEditandoItem}
                    onExcluir={handleExcluir}
                    confirmandoExclusao={confirmandoExclusao}
                    setConfirmandoExclusao={setConfirmandoExclusao}
                  />
                )
              )}
            </SortableContext>
          </DndContext>

          {adicionando ? (
            <ItemForm onSalvar={handleSalvarNovoItem} onCancelar={() => setAdicionando(false)} />
          ) : (
            <button
              onClick={() => { setAdicionando(true); setEditandoItem(null) }}
              className="flex items-center gap-1.5 text-xs text-[#253B29] hover:text-[#253B29]/80 py-1.5 px-2 rounded-lg hover:bg-[#E7E0C4]/40 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Adicionar item
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export function ChecklistsConfig() {
  const [modulo, setModulo] = useState('processos')
  const { data: dados = [], isLoading } = useChecklistTemplates(modulo)

  return (
    <div className="space-y-5">
      {/* Seletor de módulo */}
      <div className="flex gap-2 flex-wrap">
        {MODULOS.map(m => (
          <button
            key={m.id}
            onClick={() => setModulo(m.id)}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              modulo === m.id
                ? 'bg-[#253B29] text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Lista de fases */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : dados.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-sm">Nenhuma fase configurada para este módulo.</p>
          <p className="text-xs mt-1">Configure as fases primeiro em Configurações → Fases.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {dados.map(({ fase, template, itens }) => (
            <FaseSection
              key={fase.id}
              fase={fase}
              template={template}
              itens={itens}
              modulo={modulo}
            />
          ))}
        </div>
      )}
    </div>
  )
}
