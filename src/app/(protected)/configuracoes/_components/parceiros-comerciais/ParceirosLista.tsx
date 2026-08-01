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
import { Plus, Pencil, Trash2, Handshake, X, Check } from 'lucide-react'
import {
  useTodosParceiros,
  useCriarParceiro,
  useAtualizarParceiro,
  useExcluirParceiro,
} from '@/hooks/configuracoes/useParceirosComerciais'
import type { Parceiro, TipoParceiro } from '@/types/parceiros'
import { TIPO_PARCEIRO_LABEL } from '@/types/parceiros'
import { toast } from 'sonner'

interface FormState {
  nome: string
  tipo: TipoParceiro
  cpf_cnpj: string
  telefone: string
  email: string
  observacao: string
  ativo: boolean
}

const VAZIO: FormState = { nome: '', tipo: 'pessoa_fisica', cpf_cnpj: '', telefone: '', email: '', observacao: '', ativo: true }

function paraForm(r: Parceiro): FormState {
  return {
    nome: r.nome,
    tipo: r.tipo,
    cpf_cnpj: r.cpf_cnpj ?? '',
    telefone: r.telefone ?? '',
    email: r.email ?? '',
    observacao: r.observacao ?? '',
    ativo: r.ativo,
  }
}

interface FormProps {
  inicial?: Parceiro
  onSalvar: (dados: Partial<Parceiro>) => void
  onCancelar: () => void
  isPending: boolean
}

function FormParceiro({ inicial, onSalvar, onCancelar, isPending }: FormProps) {
  const [form, setForm] = useState<FormState>(inicial ? paraForm(inicial) : VAZIO)

  function set<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.nome.trim()) return
    onSalvar({
      nome: form.nome.trim(),
      tipo: form.tipo,
      cpf_cnpj: form.cpf_cnpj.trim() || null,
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
        <Input placeholder="Ex: Maria Souza" value={form.nome} onChange={(e) => set('nome', e.target.value)} autoFocus />
      </div>

      <div className="space-y-1.5">
        <Label>Tipo</Label>
        <Select value={form.tipo} onValueChange={(v) => set('tipo', v as TipoParceiro)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(TIPO_PARCEIRO_LABEL) as TipoParceiro[]).map((t) => (
              <SelectItem key={t} value={t}>{TIPO_PARCEIRO_LABEL[t]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>CPF/CNPJ</Label>
          <Input placeholder="Documento" value={form.cpf_cnpj} onChange={(e) => set('cpf_cnpj', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Telefone</Label>
          <Input placeholder="(44) 99999-9999" value={form.telefone} onChange={(e) => set('telefone', e.target.value)} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>E-mail</Label>
        <Input type="email" placeholder="parceiro@email.com" value={form.email} onChange={(e) => set('email', e.target.value)} />
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

export function ParceirosLista() {
  const { data: itens = [], isLoading } = useTodosParceiros()
  const criar = useCriarParceiro()
  const atualizar = useAtualizarParceiro()
  const excluir = useExcluirParceiro()

  const [modalAberto, setModalAberto] = useState(false)
  const [editando, setEditando] = useState<Parceiro | undefined>(undefined)
  const [confirmandoExclusao, setConfirmandoExclusao] = useState<string | null>(null)

  function abrirCriar() { setEditando(undefined); setModalAberto(true) }
  function abrirEditar(r: Parceiro) { setEditando(r); setModalAberto(true) }
  function fecharModal() { setModalAberto(false); setEditando(undefined) }

  async function handleSalvar(dados: Partial<Parceiro>) {
    try {
      if (editando) {
        await atualizar.mutateAsync({ id: editando.id, ...dados })
        toast.success('Parceiro atualizado.')
      } else {
        await criar.mutateAsync(dados as Parceiro)
        toast.success('Parceiro cadastrado.')
      }
      fecharModal()
    } catch {
      toast.error('Erro ao salvar. Tente novamente.')
    }
  }

  async function handleExcluir(id: string) {
    try {
      await excluir.mutateAsync(id)
      toast.success('Parceiro removido.')
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
          <Plus className="w-4 h-4 mr-1" /> Novo Parceiro
        </Button>
      </div>

      {itens.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          <Handshake className="h-8 w-8 mx-auto mb-2 text-gray-300" />
          <p className="text-sm">Nenhum parceiro cadastrado.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-100">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Nome</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Tipo</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">CPF/CNPJ</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Telefone</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="w-28 px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {itens.map((r, idx) => (
                <tr key={r.id} className={`border-b border-gray-50 hover:bg-gray-50 transition-colors group${idx === itens.length - 1 ? ' border-b-0' : ''}`}>
                  <td className="px-4 py-3 font-medium text-gray-800">{r.nome}</td>
                  <td className="px-4 py-3 text-gray-600">{TIPO_PARCEIRO_LABEL[r.tipo]}</td>
                  <td className="px-4 py-3 text-gray-600">{r.cpf_cnpj ?? '—'}</td>
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
            <DialogTitle>{editando ? 'Editar Parceiro' : 'Novo Parceiro'}</DialogTitle>
          </DialogHeader>
          {modalAberto && (
            <FormParceiro inicial={editando} onSalvar={handleSalvar} onCancelar={fecharModal} isPending={criar.isPending || atualizar.isPending} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
