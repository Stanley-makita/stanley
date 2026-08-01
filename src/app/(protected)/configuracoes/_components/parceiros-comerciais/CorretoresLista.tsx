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
import { Plus, Pencil, Trash2, UserRound, X, Check } from 'lucide-react'
import {
  useTodosCorretores,
  useCriarCorretor,
  useAtualizarCorretor,
  useExcluirCorretor,
  useImobiliarias,
} from '@/hooks/configuracoes/useParceirosComerciais'
import type { Corretor } from '@/types/parceiros'
import { toast } from 'sonner'

const SEM_IMOBILIARIA = '__nenhuma__'

interface FormState {
  nome: string
  creci: string
  imobiliaria_id: string
  telefone: string
  email: string
  observacao: string
  ativo: boolean
}

const VAZIO: FormState = { nome: '', creci: '', imobiliaria_id: SEM_IMOBILIARIA, telefone: '', email: '', observacao: '', ativo: true }

function paraForm(r: Corretor): FormState {
  return {
    nome: r.nome,
    creci: r.creci ?? '',
    imobiliaria_id: r.imobiliaria_id ?? SEM_IMOBILIARIA,
    telefone: r.telefone ?? '',
    email: r.email ?? '',
    observacao: r.observacao ?? '',
    ativo: r.ativo,
  }
}

interface FormProps {
  inicial?: Corretor
  onSalvar: (dados: Partial<Corretor>) => void
  onCancelar: () => void
  isPending: boolean
}

function FormCorretor({ inicial, onSalvar, onCancelar, isPending }: FormProps) {
  const [form, setForm] = useState<FormState>(inicial ? paraForm(inicial) : VAZIO)
  const { data: imobiliarias = [] } = useImobiliarias()

  function set<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.nome.trim()) return
    onSalvar({
      nome: form.nome.trim(),
      creci: form.creci.trim() || null,
      imobiliaria_id: form.imobiliaria_id === SEM_IMOBILIARIA ? null : form.imobiliaria_id,
      telefone: form.telefone.trim() || null,
      email: form.email.trim() || null,
      observacao: form.observacao.trim() || null,
      ativo: form.ativo,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-2">
      <div className="space-y-1.5">
        <Label>Nome <span className="text-red-500">*</span></Label>
        <Input placeholder="Ex: João Silva" value={form.nome} onChange={(e) => set('nome', e.target.value)} autoFocus />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>CRECI</Label>
          <Input placeholder="Ex: 12345-F" value={form.creci} onChange={(e) => set('creci', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Telefone</Label>
          <Input placeholder="(44) 99999-9999" value={form.telefone} onChange={(e) => set('telefone', e.target.value)} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Imobiliária/Construtora vinculada</Label>
        <Select value={form.imobiliaria_id} onValueChange={(v) => set('imobiliaria_id', v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={SEM_IMOBILIARIA}>Nenhuma (autônomo)</SelectItem>
            {imobiliarias.map((im) => (
              <SelectItem key={im.id} value={im.id}>{im.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>E-mail</Label>
        <Input type="email" placeholder="corretor@email.com" value={form.email} onChange={(e) => set('email', e.target.value)} />
      </div>

      <div className="space-y-1.5">
        <Label>Observação</Label>
        <Textarea placeholder="Informações adicionais..." value={form.observacao} onChange={(e) => set('observacao', e.target.value)} rows={2} className="resize-none" />
      </div>

      {inicial && (
        <div className="flex items-center gap-2">
          <Switch checked={form.ativo} onCheckedChange={(v) => set('ativo', v)} />
          <Label className="cursor-pointer">Ativo</Label>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancelar}>Cancelar</Button>
        <Button type="submit" disabled={!form.nome.trim() || isPending} className="bg-fonti-primary hover:bg-fonti-primary-hover text-white">
          {isPending ? 'Salvando...' : 'Salvar'}
        </Button>
      </div>
    </form>
  )
}

export function CorretoresLista() {
  const { data: itens = [], isLoading } = useTodosCorretores()
  const criar = useCriarCorretor()
  const atualizar = useAtualizarCorretor()
  const excluir = useExcluirCorretor()

  const [modalAberto, setModalAberto] = useState(false)
  const [editando, setEditando] = useState<Corretor | undefined>(undefined)
  const [confirmandoExclusao, setConfirmandoExclusao] = useState<string | null>(null)

  function abrirCriar() { setEditando(undefined); setModalAberto(true) }
  function abrirEditar(r: Corretor) { setEditando(r); setModalAberto(true) }
  function fecharModal() { setModalAberto(false); setEditando(undefined) }

  async function handleSalvar(dados: Partial<Corretor>) {
    try {
      if (editando) {
        await atualizar.mutateAsync({ id: editando.id, ...dados })
        toast.success('Corretor atualizado.')
      } else {
        await criar.mutateAsync(dados as Corretor)
        toast.success('Corretor cadastrado.')
      }
      fecharModal()
    } catch {
      toast.error('Erro ao salvar. Tente novamente.')
    }
  }

  async function handleExcluir(id: string) {
    try {
      await excluir.mutateAsync(id)
      toast.success('Corretor removido.')
      setConfirmandoExclusao(null)
    } catch {
      toast.error('Erro ao remover. Tente novamente.')
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(3)].map((_, i) => <div key={i} className="h-12 rounded-lg bg-gray-100 animate-pulse" />)}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-500">
          {itens.length} {itens.length === 1 ? 'cadastrado' : 'cadastrados'}
        </p>
        <Button size="sm" className="bg-fonti-primary hover:bg-fonti-accent hover:text-fonti-primary text-white" onClick={abrirCriar}>
          <Plus className="w-4 h-4 mr-1" /> Novo Corretor
        </Button>
      </div>

      {itens.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          <UserRound className="h-8 w-8 mx-auto mb-2 text-gray-300" />
          <p className="text-sm">Nenhum corretor cadastrado.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-100">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Nome</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Imobiliária</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">CRECI</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Telefone</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="w-28 px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {itens.map((r, idx) => (
                <tr key={r.id} className={`border-b border-gray-50 hover:bg-gray-50 transition-colors group${idx === itens.length - 1 ? ' border-b-0' : ''}`}>
                  <td className="px-4 py-3 font-medium text-gray-800">{r.nome}</td>
                  <td className="px-4 py-3 text-gray-600">{r.imobiliaria?.nome ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{r.creci ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{r.telefone ?? '—'}</td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className={r.ativo ? 'border-green-200 bg-green-50 text-green-700' : 'border-gray-200 bg-gray-50 text-gray-500'}>
                      {r.ativo ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-fonti-primary" onClick={() => abrirEditar(r)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {confirmandoExclusao === r.id ? (
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" className="h-7 text-xs text-red-600 hover:bg-red-50 px-2" onClick={() => handleExcluir(r.id)} disabled={excluir.isPending}>
                            <Check className="h-3 w-3 mr-0.5" /> Ok
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setConfirmandoExclusao(null)}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-red-500 hover:bg-red-50" onClick={() => setConfirmandoExclusao(r.id)}>
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
            <DialogTitle>{editando ? 'Editar Corretor' : 'Novo Corretor'}</DialogTitle>
          </DialogHeader>
          {modalAberto && (
            <FormCorretor inicial={editando} onSalvar={handleSalvar} onCancelar={fecharModal} isPending={criar.isPending || atualizar.isPending} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
