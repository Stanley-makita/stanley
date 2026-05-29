'use client'

import { useState } from 'react'
import {
  useProcessoCompradores,
  useAdicionarComprador,
  useEditarComprador,
  useRemoverComprador,
} from '@/hooks/processos/useProcessoCompradores'
import { type ProcessoComprador } from '@/types/processos'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Plus, Pencil, Trash2, User, X, Check } from 'lucide-react'

function mascaraCpf(cpf: string | null): string {
  if (!cpf) return '—'
  const s = cpf.replace(/\D/g, '')
  if (s.length !== 11) return cpf
  return `***.***.${s.slice(6, 9)}-${s.slice(9)}`
}

interface FormCompradorState {
  nome: string
  cpf: string
  email: string
  telefone: string
  renda_mensal: string
  principal: boolean
}

const FORM_VAZIO: FormCompradorState = { nome: '', cpf: '', email: '', telefone: '', renda_mensal: '', principal: false }

interface Props { processoId: string }

export function AbaCompradores({ processoId }: Props) {
  const { data: compradores = [], isLoading } = useProcessoCompradores(processoId)
  const adicionar = useAdicionarComprador(processoId)
  const editar = useEditarComprador(processoId)
  const remover = useRemoverComprador(processoId)

  const [exibirForm, setExibirForm] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [form, setForm] = useState<FormCompradorState>(FORM_VAZIO)

  function abrirFormNovo() {
    setEditandoId(null)
    setForm(FORM_VAZIO)
    setExibirForm(true)
  }

  function abrirFormEditar(c: ProcessoComprador) {
    setEditandoId(c.id)
    setForm({
      nome: c.nome,
      cpf: c.cpf ?? '',
      email: c.email ?? '',
      telefone: c.telefone ?? '',
      renda_mensal: c.renda_mensal ? String(c.renda_mensal) : '',
      principal: c.principal,
    })
    setExibirForm(true)
  }

  function fecharForm() {
    setExibirForm(false)
    setEditandoId(null)
    setForm(FORM_VAZIO)
  }

  async function salvar() {
    const payload = {
      nome: form.nome.trim(),
      cpf: form.cpf.trim() || null,
      email: form.email.trim() || null,
      telefone: form.telefone.trim() || null,
      renda_mensal: form.renda_mensal ? Number(form.renda_mensal) : null,
      principal: form.principal,
    }

    if (!payload.nome) return

    if (editandoId) {
      await editar.mutateAsync({ id: editandoId, ...payload })
    } else {
      await adicionar.mutateAsync(payload)
    }
    fecharForm()
  }

  const isPending = adicionar.isPending || editar.isPending

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-[#253B29]">
          Compradores <span className="text-gray-400 font-normal">({compradores.length})</span>
        </p>
        <Button
          size="sm"
          className="bg-[#253B29] hover:bg-[#1a2b1e] text-white gap-1.5 h-8"
          onClick={abrirFormNovo}
        >
          <Plus className="h-3.5 w-3.5" />
          Adicionar
        </Button>
      </div>

      {/* Formulário inline */}
      {exibirForm && (
        <div className="border border-[#C2AA6A] rounded-xl p-4 bg-[#E7E0C4]/20 space-y-3">
          <p className="text-xs font-semibold text-[#253B29]">
            {editandoId ? 'Editar comprador' : 'Novo comprador'}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <label className="text-xs text-gray-500 mb-1 block">Nome *</label>
              <Input
                placeholder="Nome completo"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">CPF</label>
              <Input
                placeholder="000.000.000-00"
                value={form.cpf}
                onChange={(e) => setForm({ ...form, cpf: e.target.value })}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Telefone</label>
              <Input
                placeholder="(00) 00000-0000"
                value={form.telefone}
                onChange={(e) => setForm({ ...form, telefone: e.target.value })}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">E-mail</label>
              <Input
                placeholder="email@exemplo.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Renda mensal (R$)</label>
              <Input
                type="number"
                placeholder="0,00"
                value={form.renda_mensal}
                onChange={(e) => setForm({ ...form, renda_mensal: e.target.value })}
                className="h-8 text-sm"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.principal}
              onChange={(e) => setForm({ ...form, principal: e.target.checked })}
              className="rounded accent-[#253B29]"
            />
            <span className="text-xs text-[#253B29]">Comprador principal</span>
          </label>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" className="h-8 gap-1" onClick={fecharForm}>
              <X className="h-3.5 w-3.5" /> Cancelar
            </Button>
            <Button
              size="sm"
              className="bg-[#253B29] hover:bg-[#1a2b1e] text-white h-8 gap-1"
              onClick={salvar}
              disabled={!form.nome.trim() || isPending}
            >
              <Check className="h-3.5 w-3.5" /> Salvar
            </Button>
          </div>
        </div>
      )}

      {/* Lista */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(2)].map((_, i) => <div key={i} className="h-20 bg-gray-100 animate-pulse rounded-xl" />)}
        </div>
      ) : compradores.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">Nenhum comprador cadastrado.</p>
      ) : (
        <div className="space-y-3">
          {compradores.map((c) => (
            <div key={c.id} className="flex items-start justify-between p-4 bg-white border border-gray-100 rounded-xl hover:border-gray-200 transition-colors cursor-pointer" onClick={() => abrirFormEditar(c)}>
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-[#253B29] flex items-center justify-center shrink-0">
                  <User className="h-4 w-4 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-[#253B29]">{c.nome}</p>
                    {c.principal && (
                      <Badge className="text-xs bg-[#E7E0C4] text-[#253B29] border-[#C2AA6A]">Principal</Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
                    <span className="text-xs text-gray-400">CPF: {mascaraCpf(c.cpf)}</span>
                    {c.telefone && <span className="text-xs text-gray-400">{c.telefone}</span>}
                    {c.email && <span className="text-xs text-gray-400">{c.email}</span>}
                    {c.renda_mensal && (
                      <span className="text-xs text-gray-400">
                        Renda: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(c.renda_mensal)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-gray-400 hover:text-[#253B29]"
                  onClick={() => abrirFormEditar(c)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-gray-400 hover:text-red-500"
                  onClick={() => remover.mutate(c.id)}
                >
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