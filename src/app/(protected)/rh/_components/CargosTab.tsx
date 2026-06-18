'use client'

import { useState } from 'react'
import { Plus, Search, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { useCargos, useDepartamentos, useCriarCargo, useAtualizarCargo, useExcluirCargo } from '@/hooks/rh/useCargos'
import { useRegrasComissao } from '@/hooks/rh/useComissoes'
import { RH_NIVEL_COMISSAO_LABELS } from '@/types/rh'
import type { RhCargo, RhNivelComissao } from '@/types/rh'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const VAZIO = {
  nome: '',
  descricao: '',
  departamento_id: null as string | null,
  nivel_comissao: 'sem_comissao' as RhNivelComissao,
  regra_comissao_id: null as string | null,
  ativo: true,
}

export function CargosTab() {
  const [busca, setBusca] = useState('')
  const [filtroDepto, setFiltroDepto] = useState<string>('todos')
  const [modal, setModal] = useState(false)
  const [editando, setEditando] = useState<RhCargo | null>(null)
  const [form, setForm] = useState(VAZIO)

  const { data: cargos = [] } = useCargos()
  const { data: departamentos = [] } = useDepartamentos()
  const { data: regras = [] } = useRegrasComissao()
  const criar = useCriarCargo()
  const atualizar = useAtualizarCargo()
  const excluir = useExcluirCargo()

  const filtrados = cargos.filter(c => {
    const matchBusca = c.nome.toLowerCase().includes(busca.toLowerCase())
    const matchDepto = filtroDepto === 'todos' || c.departamento_id === filtroDepto
    return matchBusca && matchDepto
  })

  function abrir(cargo?: RhCargo) {
    if (cargo) {
      setEditando(cargo)
      setForm({ nome: cargo.nome, descricao: cargo.descricao ?? '', departamento_id: cargo.departamento_id, nivel_comissao: cargo.nivel_comissao, regra_comissao_id: cargo.regra_comissao_id, ativo: cargo.ativo })
    } else {
      setEditando(null)
      setForm(VAZIO)
    }
    setModal(true)
  }

  function set(key: keyof typeof VAZIO, val: unknown) {
    setForm(f => ({ ...f, [key]: val }))
  }

  async function handleSalvar() {
    if (!form.nome.trim()) { toast.error('Nome é obrigatório'); return }
    try {
      if (editando) {
        await atualizar.mutateAsync({ id: editando.id, ...form, departamento_id: form.departamento_id || null, regra_comissao_id: form.regra_comissao_id || null, descricao: form.descricao || null })
        toast.success('Cargo atualizado.')
      } else {
        await criar.mutateAsync({ ...form, departamento_id: form.departamento_id || null, regra_comissao_id: form.regra_comissao_id || null, descricao: form.descricao || null })
        toast.success('Cargo criado.')
      }
      setModal(false)
    } catch {
      toast.error('Erro ao salvar cargo.')
    }
  }

  async function handleExcluir(id: string, nome: string) {
    if (!confirm(`Desativar cargo "${nome}"?`)) return
    try { await excluir.mutateAsync(id); toast.success('Cargo desativado.') }
    catch { toast.error('Erro ao desativar.') }
  }

  const isPending = criar.isPending || atualizar.isPending

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <Input placeholder="Buscar cargo..." className="pl-9 h-9 text-sm" value={busca} onChange={e => setBusca(e.target.value)} />
        </div>
        <div className="flex gap-1.5">
          <Button size="sm" variant={filtroDepto === 'todos' ? 'default' : 'outline'} className={cn('h-9', filtroDepto === 'todos' && 'bg-[#253B29] text-white')} onClick={() => setFiltroDepto('todos')}>
            Todos
          </Button>
          {departamentos.map(d => (
            <Button key={d.id} size="sm" variant={filtroDepto === d.id ? 'default' : 'outline'} className={cn('h-9', filtroDepto === d.id && 'bg-[#253B29] text-white')} onClick={() => setFiltroDepto(d.id)}>
              {d.nome}
            </Button>
          ))}
        </div>
        <Button size="sm" className="bg-[#253B29] text-white hover:bg-[#1a2b1e] gap-1.5 ml-auto" onClick={() => abrir()}>
          <Plus className="h-3.5 w-3.5" /> Novo Cargo
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {filtrados.length === 0 ? (
          <p className="p-8 text-center text-sm text-gray-400">Nenhum cargo cadastrado.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Cargo</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Departamento</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Nível de Comissão</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Regra Aplicada</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Status</th>
                <th className="px-4 py-3 w-20" />
              </tr>
            </thead>
            <tbody>
              {filtrados.map(c => (
                <tr key={c.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-800">{c.nome}</p>
                    {c.descricao && <p className="text-xs text-gray-400">{c.descricao}</p>}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">{c.departamento?.nome ?? '—'}</td>
                  <td className="px-4 py-3">
                    {c.nivel_comissao !== 'sem_comissao' ? (
                      <span className="text-xs bg-gray-100 text-gray-700 rounded-full px-2 py-0.5">{RH_NIVEL_COMISSAO_LABELS[c.nivel_comissao]}</span>
                    ) : <span className="text-xs text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">{c.regra_comissao?.nome ?? 'Não definida'}</td>
                  <td className="px-4 py-3">
                    <span className={cn('text-xs font-medium rounded-full px-2 py-0.5', c.ativo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>
                      {c.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => abrir(c)}>
                        <Pencil className="h-3.5 w-3.5 text-gray-400" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleExcluir(c.id, c.nome)}>
                        <Trash2 className="h-3.5 w-3.5 text-red-400" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Dialog open={modal} onOpenChange={o => { if (!o) setModal(false) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editando ? 'Editar Cargo' : 'Novo Cargo'}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1">
              <Label className="text-xs">Nome do Cargo *</Label>
              <Input placeholder="Ex: Gerente Comercial" value={form.nome} onChange={e => set('nome', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Departamento</Label>
              <Select value={form.departamento_id ?? '__none'} onValueChange={v => set('departamento_id', v === '__none' ? null : v)}>
                <SelectTrigger><SelectValue placeholder="Selecione um departamento" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— Sem departamento —</SelectItem>
                  {departamentos.map(d => <SelectItem key={d.id} value={d.id}>{d.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Descrição</Label>
              <Textarea rows={2} placeholder="Descreva as responsabilidades e atribuições do cargo" value={form.descricao} onChange={e => set('descricao', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Nível de Comissão</Label>
              <Select value={form.nivel_comissao} onValueChange={v => set('nivel_comissao', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.entries(RH_NIVEL_COMISSAO_LABELS) as [RhNivelComissao, string][]).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Regra de Comissão</Label>
              <Select value={form.regra_comissao_id ?? '__none'} onValueChange={v => set('regra_comissao_id', v === '__none' ? null : v)}>
                <SelectTrigger><SelectValue placeholder="Selecione a regra de comissão" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— Sem regra —</SelectItem>
                  {regras.filter(r => r.ativa).map(r => <SelectItem key={r.id} value={r.id}>{r.nome}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-gray-400">Opcional: pode ser definido posteriormente</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModal(false)}>Cancelar</Button>
            <Button onClick={handleSalvar} disabled={isPending} className="bg-[#253B29] text-white hover:bg-[#1a2b1e]">
              {isPending ? 'Salvando...' : 'Criar Cargo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
