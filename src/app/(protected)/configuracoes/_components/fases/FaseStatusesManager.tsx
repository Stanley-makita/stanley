'use client'

import { useState } from 'react'
import { Plus, Trash2, GripVertical, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import {
  useFaseStatuses,
  useCriarFaseStatus,
  useAtualizarFaseStatus,
  useExcluirFaseStatus,
} from '../../_hooks/useFaseStatuses'
import type { FaseStatus } from '@/types/leads'

interface Props {
  faseId: string
}

const CORES_PRESET = [
  '#6B7280', '#3B82F6', '#F59E0B', '#10B981', '#EF4444',
  '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#84CC16',
]

export function FaseStatusesManager({ faseId }: Props) {
  const { data: statuses = [], isLoading } = useFaseStatuses(faseId)
  const criar    = useCriarFaseStatus()
  const atualizar = useAtualizarFaseStatus()
  const excluir  = useExcluirFaseStatus()

  const [novoNome, setNovoNome] = useState('')
  const [novaCor,  setNovaCor]  = useState('#6B7280')
  const [adicionando, setAdicionando] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [editNome, setEditNome] = useState('')
  const [editCor,  setEditCor]  = useState('')

  async function handleAdicionar() {
    if (!novoNome.trim()) return
    try {
      await criar.mutateAsync({ fase_id: faseId, nome: novoNome.trim(), cor: novaCor, ordem: statuses.length })
      setNovoNome('')
      setNovaCor('#6B7280')
      setAdicionando(false)
      toast.success('Status criado.')
    } catch {
      toast.error('Erro ao criar status.')
    }
  }

  function iniciarEdicao(s: FaseStatus) {
    setEditandoId(s.id)
    setEditNome(s.nome)
    setEditCor(s.cor)
  }

  async function handleSalvarEdicao(s: FaseStatus) {
    try {
      await atualizar.mutateAsync({ id: s.id, fase_id: faseId, nome: editNome.trim(), cor: editCor })
      setEditandoId(null)
      toast.success('Status atualizado.')
    } catch {
      toast.error('Erro ao salvar.')
    }
  }

  async function handleExcluir(s: FaseStatus) {
    try {
      await excluir.mutateAsync({ id: s.id, fase_id: faseId })
      toast.success('Status removido.')
    } catch {
      toast.error('Erro ao remover.')
    }
  }

  if (isLoading) return <p className="text-xs text-gray-400">Carregando...</p>

  return (
    <div className="space-y-2">
      {statuses.length === 0 && !adicionando && (
        <p className="text-xs text-gray-400 italic">Nenhum status configurado. Adicione ao menos um.</p>
      )}

      {statuses.map((s) =>
        editandoId === s.id ? (
          <div key={s.id} className="flex items-center gap-2 p-2 border border-fonti-accent rounded-lg bg-amber-50">
            <input
              type="color"
              value={editCor}
              onChange={(e) => setEditCor(e.target.value)}
              className="w-7 h-7 rounded cursor-pointer border border-gray-200 shrink-0"
            />
            <Input
              value={editNome}
              onChange={(e) => setEditNome(e.target.value)}
              className="h-8 text-sm flex-1"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') handleSalvarEdicao(s) }}
            />
            <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600" onClick={() => handleSalvarEdicao(s)}>
              <Check className="w-4 h-4" />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-gray-400" onClick={() => setEditandoId(null)}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        ) : (
          <div key={s.id} className="flex items-center gap-2 p-2 border border-gray-100 rounded-lg group hover:border-gray-200 bg-white">
            <GripVertical className="w-3.5 h-3.5 text-gray-300 shrink-0" />
            <span
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: s.cor }}
            />
            <button
              className="flex-1 text-sm text-left text-gray-700 hover:text-gray-900"
              onClick={() => iniciarEdicao(s)}
            >
              {s.nome}
            </button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => handleExcluir(s)}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        )
      )}

      {adicionando ? (
        <div className="space-y-2 p-3 border border-dashed border-fonti-accent rounded-lg bg-amber-50/40">
          <Input
            placeholder="Nome do status"
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
            autoFocus
            className="h-8 text-sm"
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdicionar() }}
          />
          <div className="flex gap-1.5 flex-wrap">
            {CORES_PRESET.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setNovaCor(c)}
                className={['w-6 h-6 rounded-full border-2 transition-all', novaCor === c ? 'border-gray-700 scale-110' : 'border-transparent'].join(' ')}
                style={{ backgroundColor: c }}
              />
            ))}
            <input
              type="color"
              value={novaCor}
              onChange={(e) => setNovaCor(e.target.value)}
              className="w-6 h-6 rounded cursor-pointer border border-gray-200"
            />
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="bg-fonti-primary text-white text-xs h-7"
              onClick={handleAdicionar}
              disabled={!novoNome.trim() || criar.isPending}
            >
              Adicionar
            </Button>
            <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => setAdicionando(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full text-xs border-dashed"
          onClick={() => setAdicionando(true)}
        >
          <Plus className="w-3.5 h-3.5 mr-1" />
          Novo status
        </Button>
      )}
    </div>
  )
}
