'use client'

import { useState } from 'react'
import { Plus, Trash2, Check, X, ExternalLink, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import {
  useFaseChecklists,
  useCriarChecklistItem,
  useAtualizarChecklistItem,
  useExcluirChecklistItem,
  TIPOS_CHECKLIST,
  type TipoChecklistItem,
  type ChecklistItem,
} from '../../_hooks/useFaseChecklists'

interface Props {
  faseId: string
}

const TIPO_ICONE: Record<TipoChecklistItem, string> = {
  manual:       '☑',
  restritivos:  '🔍',
  documento:    '📄',
  formulario:   '📝',
  link_externo: '🔗',
}

const novoItemVazio = () => ({
  descricao: '',
  tipo: 'manual' as TipoChecklistItem,
  link_externo: '',
  obrigatorio: false,
  bloqueia_avanco: false,
  acao_ao_completar: '' as string,
})

export function FaseChecklistsManager({ faseId }: Props) {
  const { data, isLoading } = useFaseChecklists(faseId)
  const criar    = useCriarChecklistItem()
  const atualizar = useAtualizarChecklistItem()
  const excluir  = useExcluirChecklistItem()

  const itens = data?.itens ?? []

  const [adicionando, setAdicionando] = useState(false)
  const [novo, setNovo] = useState(novoItemVazio())
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState(novoItemVazio())

  async function handleAdicionar() {
    if (!novo.descricao.trim()) return
    try {
      await criar.mutateAsync({
        fase_id:         faseId,
        descricao:       novo.descricao.trim(),
        tipo:            novo.tipo,
        link_externo:    novo.tipo === 'link_externo' ? novo.link_externo || null : null,
        obrigatorio:     novo.obrigatorio,
        bloqueia_avanco: novo.bloqueia_avanco,
        acao_ao_completar: novo.acao_ao_completar || null,
        ordem:           itens.length,
      })
      setNovo(novoItemVazio())
      setAdicionando(false)
      toast.success('Item adicionado ao checklist.')
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? String(err)
      console.error('[FaseChecklistsManager] criar item:', err)
      toast.error(`Erro ao adicionar item: ${msg}`)
    }
  }

  function iniciarEdicao(item: ChecklistItem) {
    setEditandoId(item.id)
    setEditForm({
      descricao: item.descricao,
      tipo: item.tipo,
      link_externo: item.link_externo ?? '',
      obrigatorio: item.obrigatorio,
      bloqueia_avanco: item.bloqueia_avanco,
      acao_ao_completar: item.acao_ao_completar ?? '',
    })
  }

  async function handleSalvarEdicao(item: ChecklistItem) {
    try {
      await atualizar.mutateAsync({
        id:              item.id,
        fase_id:         faseId,
        descricao:       editForm.descricao.trim(),
        tipo:            editForm.tipo,
        link_externo:    editForm.tipo === 'link_externo' ? editForm.link_externo || null : null,
        obrigatorio:     editForm.obrigatorio,
        bloqueia_avanco: editForm.bloqueia_avanco,
        acao_ao_completar: editForm.acao_ao_completar || null,
      })
      setEditandoId(null)
      toast.success('Item atualizado.')
    } catch {
      toast.error('Erro ao salvar.')
    }
  }

  async function handleExcluir(item: ChecklistItem) {
    try {
      await excluir.mutateAsync({ id: item.id, fase_id: faseId })
      toast.success('Item removido.')
    } catch {
      toast.error('Erro ao remover.')
    }
  }

  if (isLoading) return <p className="text-xs text-gray-400">Carregando...</p>

  return (
    <div className="space-y-2">
      {itens.length === 0 && !adicionando && (
        <p className="text-xs text-gray-400 italic">Nenhum item de checklist configurado para esta fase.</p>
      )}

      {itens.map((item) =>
        editandoId === item.id ? (
          <ItemForm
            key={item.id}
            form={editForm}
            onChange={setEditForm}
            onConfirm={() => handleSalvarEdicao(item)}
            onCancel={() => setEditandoId(null)}
            isLoading={atualizar.isPending}
          />
        ) : (
          <div key={item.id} className="flex items-start gap-2 p-2 border border-gray-100 rounded-lg group hover:border-gray-200 bg-white">
            <span className="text-base mt-0.5 shrink-0">{TIPO_ICONE[item.tipo]}</span>
            <div className="flex-1 min-w-0">
              <button
                className="text-sm text-left text-gray-700 hover:text-gray-900 w-full truncate block"
                onClick={() => iniciarEdicao(item)}
              >
                {item.descricao}
              </button>
              <div className="flex gap-2 mt-0.5 flex-wrap">
                <span className="text-[10px] text-gray-400">{TIPOS_CHECKLIST[item.tipo]}</span>
                {item.obrigatorio && (
                  <span className="text-[10px] text-amber-600 font-medium flex items-center gap-0.5">
                    <AlertCircle className="w-3 h-3" /> Obrigatório
                  </span>
                )}
                {item.bloqueia_avanco && (
                  <span className="text-[10px] text-red-500 font-medium">Bloqueia avanço</span>
                )}
                {item.link_externo && (
                  <a
                    href={item.link_externo}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-blue-500 flex items-center gap-0.5 hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink className="w-3 h-3" /> Link
                  </a>
                )}
                {item.acao_ao_completar === 'emitido' && (
                  <span className="text-[10px] text-green-600 font-medium">🎉 Marca como Emitido</span>
                )}
              </div>
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
              onClick={() => handleExcluir(item)}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        )
      )}

      {adicionando ? (
        <ItemForm
          form={novo}
          onChange={setNovo}
          onConfirm={handleAdicionar}
          onCancel={() => { setAdicionando(false); setNovo(novoItemVazio()) }}
          isLoading={criar.isPending}
        />
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full text-xs border-dashed"
          onClick={() => setAdicionando(true)}
        >
          <Plus className="w-3.5 h-3.5 mr-1" />
          Novo item no checklist
        </Button>
      )}
    </div>
  )
}

interface ItemFormProps {
  form: ReturnType<typeof novoItemVazio>
  onChange: (v: ReturnType<typeof novoItemVazio>) => void
  onConfirm: () => void
  onCancel: () => void
  isLoading: boolean
}

function ItemForm({ form, onChange, onConfirm, onCancel, isLoading }: ItemFormProps) {
  const set = (key: string, value: unknown) => onChange({ ...form, [key]: value })

  return (
    <div className="space-y-3 p-3 border border-dashed border-[#C2AA6A] rounded-lg bg-amber-50/40">
      <div className="space-y-1">
        <Label className="text-xs">Descrição *</Label>
        <Input
          placeholder="Ex: Consultar CPF no Serasa"
          value={form.descricao}
          onChange={(e) => set('descricao', e.target.value)}
          autoFocus
          className="h-8 text-sm"
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Tipo</Label>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(TIPOS_CHECKLIST) as TipoChecklistItem[]).map((tipo) => (
            <button
              key={tipo}
              type="button"
              onClick={() => set('tipo', tipo)}
              className={[
                'px-2 py-1 rounded text-xs border transition-all',
                form.tipo === tipo
                  ? 'border-[#253B29] bg-[#253B29] text-white'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300',
              ].join(' ')}
            >
              {TIPO_ICONE[tipo]} {TIPOS_CHECKLIST[tipo]}
            </button>
          ))}
        </div>
      </div>

      {form.tipo === 'link_externo' && (
        <div className="space-y-1">
          <Label className="text-xs">URL do link</Label>
          <Input
            placeholder="https://..."
            value={form.link_externo}
            onChange={(e) => set('link_externo', e.target.value)}
            className="h-8 text-sm"
          />
        </div>
      )}

      <div className="flex gap-4">
        <div className="flex items-center gap-2">
          <Switch
            checked={form.obrigatorio}
            onCheckedChange={(v) => set('obrigatorio', v)}
            id="obrigatorio-novo"
          />
          <Label htmlFor="obrigatorio-novo" className="text-xs cursor-pointer">Obrigatório</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={form.bloqueia_avanco}
            onCheckedChange={(v) => set('bloqueia_avanco', v)}
            id="bloqueia-novo"
          />
          <Label htmlFor="bloqueia-novo" className="text-xs cursor-pointer">Bloqueia avanço</Label>
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Ao completar este item</Label>
        <Select
          value={form.acao_ao_completar || 'none'}
          onValueChange={(v) => set('acao_ao_completar', v === 'none' ? '' : v)}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Nenhuma ação</SelectItem>
            <SelectItem value="emitido">🎉 Marcar processo como Emitido</SelectItem>
            <SelectItem value="salvar_vencimento_credito">📅 Salvar validade do Crédito</SelectItem>
            <SelectItem value="salvar_vencimento_matricula">📅 Salvar validade da Matrícula</SelectItem>
            <SelectItem value="salvar_engenharia">📐 Salvar Engenharia (vencimento + valor)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-2">
        <Button
          size="sm"
          className="bg-[#253B29] text-white text-xs h-7"
          onClick={onConfirm}
          disabled={!form.descricao.trim() || isLoading}
        >
          <Check className="w-3.5 h-3.5 mr-1" /> Adicionar
        </Button>
        <Button size="sm" variant="outline" className="text-xs h-7" onClick={onCancel}>
          <X className="w-3.5 h-3.5 mr-1" /> Cancelar
        </Button>
      </div>
    </div>
  )
}
