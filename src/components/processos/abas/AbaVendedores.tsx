'use client'

import { useState } from 'react'
import {
  useProcessoVendedores,
  useAdicionarVendedor,
  useEditarVendedor,
  useRemoverVendedor,
} from '@/hooks/processos/useProcessoVendedores'
import { type ProcessoVendedor } from '@/types/processos'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Pencil, Trash2, User, X, Check } from 'lucide-react'

function mascaraCpf(cpf: string | null): string {
  if (!cpf) return '—'
  const s = cpf.replace(/\D/g, '')
  if (s.length !== 11) return cpf
  return `***.***.${s.slice(6, 9)}-${s.slice(9)}`
}

interface FormVendedorState {
  nome: string
  cpf: string
  email: string
  telefone: string
}

const FORM_VAZIO: FormVendedorState = { nome: '', cpf: '', email: '', telefone: '' }

interface Props { processoId: string }

export function AbaVendedores({ processoId }: Props) {
  const { data: vendedores = [], isLoading } = useProcessoVendedores(processoId)
  const adicionar = useAdicionarVendedor(processoId)
  const editar = useEditarVendedor(processoId)
  const remover = useRemoverVendedor(processoId)

  const [exibirForm, setExibirForm] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [form, setForm] = useState<FormVendedorState>(FORM_VAZIO)

  function abrirFormNovo() { setEditandoId(null); setForm(FORM_VAZIO); setExibirForm(true) }

  function abrirFormEditar(v: ProcessoVendedor) {
    setEditandoId(v.id)
    setForm({ nome: v.nome, cpf: v.cpf ?? '', email: v.email ?? '', telefone: v.telefone ?? '' })
    setExibirForm(true)
  }

  function fecharForm() { setExibirForm(false); setEditandoId(null); setForm(FORM_VAZIO) }

  async function salvar() {
    const payload = {
      nome: form.nome.trim(),
      cpf: form.cpf.trim() || null,
      email: form.email.trim() || null,
      telefone: form.telefone.trim() || null,
    }
    if (!payload.nome) return
    if (editandoId) await editar.mutateAsync({ id: editandoId, ...payload })
    else await adicionar.mutateAsync(payload)
    fecharForm()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-[#253B29]">
          Vendedores <span className="text-gray-400 font-normal">({vendedores.length})</span>
        </p>
        <Button size="sm" className="bg-[#253B29] hover:bg-[#1a2b1e] text-white gap-1.5 h-8" onClick={abrirFormNovo}>
          <Plus className="h-3.5 w-3.5" /> Adicionar
        </Button>
      </div>

      {exibirForm && (
        <div className="border border-[#C2AA6A] rounded-xl p-4 bg-[#E7E0C4]/20 space-y-3">
          <p className="text-xs font-semibold text-[#253B29]">{editandoId ? 'Editar vendedor' : 'Novo vendedor'}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <label className="text-xs text-gray-500 mb-1 block">Nome *</label>
              <Input placeholder="Nome completo" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className="h-8 text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">CPF</label>
              <Input placeholder="000.000.000-00" value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} className="h-8 text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Telefone</label>
              <Input placeholder="(00) 00000-0000" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} className="h-8 text-sm" />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-gray-500 mb-1 block">E-mail</label>
              <Input placeholder="email@exemplo.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="h-8 text-sm" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" className="h-8 gap-1" onClick={fecharForm}><X className="h-3.5 w-3.5" /> Cancelar</Button>
            <Button size="sm" className="bg-[#253B29] hover:bg-[#1a2b1e] text-white h-8 gap-1" onClick={salvar} disabled={!form.nome.trim() || adicionar.isPending || editar.isPending}>
              <Check className="h-3.5 w-3.5" /> Salvar
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">{[...Array(2)].map((_, i) => <div key={i} className="h-16 bg-gray-100 animate-pulse rounded-xl" />)}</div>
      ) : vendedores.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">Nenhum vendedor cadastrado.</p>
      ) : (
        <div className="space-y-3">
          {vendedores.map((v) => (
            <div key={v.id} className="flex items-start justify-between p-4 bg-white border border-gray-100 rounded-xl hover:border-gray-200 transition-colors">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
                  <User className="h-4 w-4 text-gray-500" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#253B29]">{v.nome}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
                    <span className="text-xs text-gray-400">CPF: {mascaraCpf(v.cpf)}</span>
                    {v.telefone && <span className="text-xs text-gray-400">{v.telefone}</span>}
                    {v.email && <span className="text-xs text-gray-400">{v.email}</span>}
                  </div>
                </div>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-[#253B29]" onClick={() => abrirFormEditar(v)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-red-500" onClick={() => remover.mutate(v.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}