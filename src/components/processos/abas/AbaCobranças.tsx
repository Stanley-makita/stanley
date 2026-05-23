'use client'

import { useState } from 'react'
import { useProcessoCobranças, useAdicionarCobrança, useAtualizarStatusCobrança } from '@/hooks/processos/useProcessoCobranças'
import { type ProcessoCobranca } from '@/types/processos'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Plus, X, Check, MoreHorizontal, DollarSign } from 'lucide-react'

function fmtMoeda(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function statusLabel(status: ProcessoCobranca['status'], vencimento: string): string {
  if (status === 'pago') return 'Pago'
  if (status === 'cancelado') return 'Cancelado'
  if (new Date(vencimento) < new Date() && status === 'pendente') return 'Vencido'
  return 'Pendente'
}

function statusClass(status: ProcessoCobranca['status'], vencimento: string): string {
  if (status === 'pago') return 'bg-green-50 text-green-700 border-green-200'
  if (status === 'cancelado') return 'bg-gray-100 text-gray-500 border-gray-200'
  if (new Date(vencimento) < new Date()) return 'bg-red-50 text-red-600 border-red-200'
  return 'bg-amber-50 text-amber-700 border-amber-200'
}

interface Props { processoId: string }

export function AbaCobranças({ processoId }: Props) {
  const { data: cobranças = [], isLoading } = useProcessoCobranças(processoId)
  const adicionar = useAdicionarCobrança(processoId)
  const atualizar = useAtualizarStatusCobrança(processoId)

  const [exibirForm, setExibirForm] = useState(false)
  const [form, setForm] = useState({ descricao: '', valor: '', data_vencimento: '' })

  const totalAberto   = cobranças.filter((c) => c.status === 'pendente').reduce((s, c) => s + c.valor, 0)
  const totalPago     = cobranças.filter((c) => c.status === 'pago').reduce((s, c) => s + c.valor, 0)
  const totalVencido  = cobranças.filter((c) => c.status === 'pendente' && new Date(c.data_vencimento) < new Date()).reduce((s, c) => s + c.valor, 0)

  async function salvar() {
    if (!form.descricao.trim() || !form.valor || !form.data_vencimento) return
    await adicionar.mutateAsync({ descricao: form.descricao.trim(), valor: Number(form.valor), data_vencimento: form.data_vencimento })
    setForm({ descricao: '', valor: '', data_vencimento: '' })
    setExibirForm(false)
  }

  return (
    <div className="space-y-5">
      {/* Resumo */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border bg-amber-50 border-amber-200 p-4">
          <p className="text-xs text-gray-500 mb-1">Em Aberto</p>
          <p className="text-lg font-bold text-amber-700">{fmtMoeda(totalAberto)}</p>
        </div>
        <div className="rounded-xl border bg-green-50 border-green-200 p-4">
          <p className="text-xs text-gray-500 mb-1">Pago</p>
          <p className="text-lg font-bold text-green-700">{fmtMoeda(totalPago)}</p>
        </div>
        <div className="rounded-xl border bg-red-50 border-red-200 p-4">
          <p className="text-xs text-gray-500 mb-1">Vencido</p>
          <p className="text-lg font-bold text-red-600">{fmtMoeda(totalVencido)}</p>
        </div>
      </div>

      <div className="flex justify-end">
        <Button size="sm" className="bg-[#253B29] hover:bg-[#1a2b1e] text-white gap-1.5 h-8" onClick={() => setExibirForm(!exibirForm)}>
          <Plus className="h-3.5 w-3.5" /> Nova Cobrança
        </Button>
      </div>

      {exibirForm && (
        <div className="border border-[#C2AA6A] rounded-xl p-4 bg-[#E7E0C4]/20 space-y-3">
          <p className="text-xs font-semibold text-[#253B29]">Nova cobrança</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Descrição *</label>
              <Input placeholder="Ex: Honorários" value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} className="h-8 text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Valor (R$) *</label>
              <Input type="number" placeholder="0,00" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} className="h-8 text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Vencimento *</label>
              <Input type="date" value={form.data_vencimento} onChange={(e) => setForm({ ...form, data_vencimento: e.target.value })} className="h-8 text-sm" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" className="h-8 gap-1" onClick={() => setExibirForm(false)}><X className="h-3.5 w-3.5" /> Cancelar</Button>
            <Button size="sm" className="bg-[#253B29] hover:bg-[#1a2b1e] text-white h-8 gap-1" onClick={salvar} disabled={!form.descricao.trim() || !form.valor || !form.data_vencimento || adicionar.isPending}>
              <Check className="h-3.5 w-3.5" /> Salvar
            </Button>
          </div>
        </div>
      )}

      {/* Tabela */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-8 bg-gray-100 animate-pulse rounded" />)}</div>
        ) : cobranças.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">Nenhuma cobrança registrada.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {['Descrição','Valor','Vencimento','Pagamento','Status',''].map((h) => (
                  <th key={h} className="text-left text-xs text-gray-500 font-medium px-4 py-2.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cobranças.map((c) => (
                <tr key={c.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-[#253B29]">{c.descricao}</td>
                  <td className="px-4 py-2.5 font-medium text-[#253B29]">{fmtMoeda(c.valor)}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                    {new Date(c.data_vencimento).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                    {c.data_pagamento ? new Date(c.data_pagamento).toLocaleDateString('pt-BR') : '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant="outline" className={`text-xs ${statusClass(c.status, c.data_vencimento)}`}>
                      {statusLabel(c.status, c.data_vencimento)}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    {c.status !== 'pago' && c.status !== 'cancelado' && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-gray-400">
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            className="gap-2 text-green-700"
                            onClick={() => atualizar.mutate({ id: c.id, status: 'pago', data_pagamento: new Date().toISOString().slice(0, 10) })}
                          >
                            <DollarSign className="h-3.5 w-3.5" /> Marcar como pago
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="gap-2 text-gray-500"
                            onClick={() => atualizar.mutate({ id: c.id, status: 'cancelado' })}
                          >
                            <X className="h-3.5 w-3.5" /> Cancelar cobrança
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}