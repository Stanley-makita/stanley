'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Plus, Pencil, Trash2, Landmark, X, Check } from 'lucide-react'
import {
  useTodosRegistrosImoveis,
  useCriarRegistroImoveis,
  useAtualizarRegistroImoveis,
  useExcluirRegistroImoveis,
} from '@/hooks/configuracoes/useRegistrosImoveis'
import type { RegistroImoveis } from '@/types/imoveis'
import { toast } from 'sonner'

const UFS = [
  'AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT',
  'PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO',
]

interface FormState {
  nome: string
  cidade: string
  uf: string
  telefone: string
  observacao: string
  ativo: boolean
}

const VAZIO: FormState = { nome: '', cidade: '', uf: '', telefone: '', observacao: '', ativo: true }

function registroToForm(r: RegistroImoveis): FormState {
  return {
    nome: r.nome,
    cidade: r.cidade ?? '',
    uf: r.uf ?? '',
    telefone: r.telefone ?? '',
    observacao: r.observacao ?? '',
    ativo: r.ativo,
  }
}

interface FormProps {
  inicial?: RegistroImoveis
  onSalvar: (dados: Omit<RegistroImoveis, 'id' | 'empresa_id' | 'created_at' | 'updated_at' | 'deleted_at'>) => void
  onCancelar: () => void
  isPending: boolean
}

function FormRegistroImoveis({ inicial, onSalvar, onCancelar, isPending }: FormProps) {
  const [form, setForm] = useState<FormState>(inicial ? registroToForm(inicial) : VAZIO)

  function set(field: keyof FormState, value: string | boolean) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.nome.trim()) return
    onSalvar({
      nome: form.nome.trim(),
      cidade: form.cidade.trim() || null,
      uf: form.uf || null,
      telefone: form.telefone.trim() || null,
      observacao: form.observacao.trim() || null,
      ativo: form.ativo,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-2">
      <div className="space-y-1.5">
        <Label htmlFor="ri-nome">Nome <span className="text-red-500">*</span></Label>
        <Input
          id="ri-nome"
          placeholder="Ex: 1º RI Maringá"
          value={form.nome}
          onChange={(e) => set('nome', e.target.value)}
          autoFocus
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Cidade</Label>
          <Input
            placeholder="Ex: Maringá"
            value={form.cidade}
            onChange={(e) => set('cidade', e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>UF</Label>
          <Select value={form.uf} onValueChange={(v) => set('uf', v)}>
            <SelectTrigger>
              <SelectValue placeholder="UF" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">—</SelectItem>
              {UFS.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Telefone</Label>
        <Input
          placeholder="(44) 3262-0000"
          value={form.telefone}
          onChange={(e) => set('telefone', e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Observação</Label>
        <Textarea
          placeholder="Informações adicionais..."
          value={form.observacao}
          onChange={(e) => set('observacao', e.target.value)}
          rows={2}
          className="resize-none"
        />
      </div>

      {inicial && (
        <div className="flex items-center gap-2">
          <Switch id="ri-ativo" checked={form.ativo} onCheckedChange={(v) => set('ativo', v)} />
          <Label htmlFor="ri-ativo" className="cursor-pointer">Ativo</Label>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancelar}>Cancelar</Button>
        <Button
          type="submit"
          disabled={!form.nome.trim() || isPending}
          className="bg-[#253B29] hover:bg-[#1a2b1e] text-white"
        >
          {isPending ? 'Salvando...' : 'Salvar'}
        </Button>
      </div>
    </form>
  )
}

export function RegistrosImoveisLista() {
  const { data: registros = [], isLoading } = useTodosRegistrosImoveis()
  const criar = useCriarRegistroImoveis()
  const atualizar = useAtualizarRegistroImoveis()
  const excluir = useExcluirRegistroImoveis()

  const [modalAberto, setModalAberto] = useState(false)
  const [editando, setEditando] = useState<RegistroImoveis | undefined>(undefined)
  const [confirmandoExclusao, setConfirmandoExclusao] = useState<string | null>(null)

  function abrirCriar() {
    setEditando(undefined)
    setModalAberto(true)
  }

  function abrirEditar(r: RegistroImoveis) {
    setEditando(r)
    setModalAberto(true)
  }

  function fecharModal() {
    setModalAberto(false)
    setEditando(undefined)
  }

  async function handleSalvar(dados: Omit<RegistroImoveis, 'id' | 'empresa_id' | 'created_at' | 'updated_at' | 'deleted_at'>) {
    try {
      if (editando) {
        await atualizar.mutateAsync({ id: editando.id, ...dados })
        toast.success('Registro atualizado.')
      } else {
        await criar.mutateAsync(dados)
        toast.success('Registro cadastrado.')
      }
      fecharModal()
    } catch {
      toast.error('Erro ao salvar. Tente novamente.')
    }
  }

  async function handleExcluir(id: string) {
    try {
      await excluir.mutateAsync(id)
      toast.success('Registro removido.')
      setConfirmandoExclusao(null)
    } catch {
      toast.error('Erro ao remover. Tente novamente.')
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-12 rounded-lg bg-gray-100 animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-500">
          {registros.length} {registros.length === 1 ? 'registro' : 'registros'} cadastrado{registros.length !== 1 ? 's' : ''}
        </p>
        <Button
          size="sm"
          className="bg-[#253B29] hover:bg-[#C2AA6A] hover:text-[#253B29] text-white"
          onClick={abrirCriar}
        >
          <Plus className="w-4 h-4 mr-1" /> Novo Registro
        </Button>
      </div>

      {registros.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          <Landmark className="h-8 w-8 mx-auto mb-2 text-gray-300" />
          <p className="text-sm">Nenhum registro de imóveis cadastrado.</p>
          <p className="text-xs mt-1 text-gray-300">Ex: 1º RI Maringá, 2º RI Maringá, RI Sarandi...</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-100">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Nome</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Cidade</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">UF</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Telefone</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="w-28 px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {registros.map((r, idx) => (
                <tr
                  key={r.id}
                  className={`border-b border-gray-50 hover:bg-gray-50 transition-colors group${idx === registros.length - 1 ? ' border-b-0' : ''}`}
                >
                  <td className="px-4 py-3 font-medium text-gray-800">{r.nome}</td>
                  <td className="px-4 py-3 text-gray-600">{r.cidade ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{r.uf ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{r.telefone ?? '—'}</td>
                  <td className="px-4 py-3">
                    <Badge
                      variant="outline"
                      className={r.ativo
                        ? 'border-green-200 bg-green-50 text-green-700'
                        : 'border-gray-200 bg-gray-50 text-gray-500'}
                    >
                      {r.ativo ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-gray-400 hover:text-[#253B29]"
                        onClick={() => abrirEditar(r)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {confirmandoExclusao === r.id ? (
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-red-600 hover:bg-red-50 px-2"
                            onClick={() => handleExcluir(r.id)}
                            disabled={excluir.isPending}
                          >
                            <Check className="h-3 w-3 mr-0.5" /> Ok
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => setConfirmandoExclusao(null)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-gray-400 hover:text-red-500 hover:bg-red-50"
                          onClick={() => setConfirmandoExclusao(r.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={modalAberto} onOpenChange={(open: boolean) => !open && fecharModal()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editando ? 'Editar Registro de Imóveis' : 'Novo Registro de Imóveis'}
            </DialogTitle>
          </DialogHeader>
          {modalAberto && (
            <FormRegistroImoveis
              inicial={editando}
              onSalvar={handleSalvar}
              onCancelar={fecharModal}
              isPending={criar.isPending || atualizar.isPending}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
