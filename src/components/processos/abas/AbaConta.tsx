'use client'

import { useState } from 'react'
import { useProcesso } from '@/hooks/processos/useProcessos'
import { useProcessoContaMovimentos, useAdicionarMovimento } from '@/hooks/processos/useProcessoContaMovimentos'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Plus, TrendingUp, TrendingDown, Wallet, X, Check } from 'lucide-react'

function fmtMoeda(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

interface Props { processoId: string }

export function AbaConta({ processoId }: Props) {
  const { data: processo } = useProcesso(processoId)
  const { data: movimentos = [], isLoading } = useProcessoContaMovimentos(processoId)
  const adicionarMovimento = useAdicionarMovimento(processoId)

  const [exibirForm, setExibirForm] = useState(false)
  const [form, setForm] = useState({ tipo: 'credito' as 'credito' | 'debito', descricao: '', valor: '', data_movimento: new Date().toISOString().slice(0, 10) })

  const totalCreditos = movimentos.filter((m) => m.tipo === 'credito').reduce((s, m) => s + m.valor, 0)
  const totalDebitos  = movimentos.filter((m) => m.tipo === 'debito').reduce((s, m) => s + m.valor, 0)
  const saldo         = totalCreditos - totalDebitos

  async function salvar() {
    if (!form.descricao.trim() || !form.valor) return
    await adicionarMovimento.mutateAsync({
      tipo: form.tipo,
      descricao: form.descricao.trim(),
      valor: Number(form.valor),
      data_movimento: form.data_movimento,
    })
    setForm({ tipo: 'credito', descricao: '', valor: '', data_movimento: new Date().toISOString().slice(0, 10) })
    setExibirForm(false)
  }

  return (
    <div className="space-y-5">
      {/* Cards de resumo */}
      <div className="grid grid-cols-3 gap-3">
        <div className={`rounded-xl border p-4 ${saldo >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-gray-500">Saldo Atual</span>
            <Wallet className={`h-4 w-4 ${saldo >= 0 ? 'text-green-600' : 'text-red-500'}`} />
          </div>
          <p className={`text-xl font-bold ${saldo >= 0 ? 'text-green-700' : 'text-red-600'}`}>{fmtMoeda(saldo)}</p>
        </div>
        <div className="rounded-xl border bg-blue-50 border-blue-200 p-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-gray-500">Total Créditos</span>
            <TrendingUp className="h-4 w-4 text-blue-600" />
          </div>
          <p className="text-xl font-bold text-blue-700">{fmtMoeda(totalCreditos)}</p>
        </div>
        <div className="rounded-xl border bg-orange-50 border-orange-200 p-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-gray-500">Total Débitos</span>
            <TrendingDown className="h-4 w-4 text-orange-600" />
          </div>
          <p className="text-xl font-bold text-orange-700">{fmtMoeda(totalDebitos)}</p>
        </div>
      </div>

      {/* Botão + form */}
      <div className="flex justify-end">
        <Button size="sm" className="bg-[#253B29] hover:bg-[#1a2b1e] text-white gap-1.5 h-8" onClick={() => setExibirForm(!exibirForm)}>
          <Plus className="h-3.5 w-3.5" /> Lançamento
        </Button>
      </div>

      {exibirForm && (
        <div className="border border-[#C2AA6A] rounded-xl p-4 bg-[#E7E0C4]/20 space-y-3">
          <p className="text-xs font-semibold text-[#253B29]">Novo lançamento</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v as 'credito' | 'debito' })}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="credito">Crédito</SelectItem>
                <SelectItem value="debito">Débito</SelectItem>
              </SelectContent>
            </Select>
            <div className="col-span-2 md:col-span-1">
              <Input placeholder="Descrição" value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} className="h-8 text-sm" />
            </div>
            <Input type="number" placeholder="Valor" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} className="h-8 text-sm" />
            <Input type="date" value={form.data_movimento} onChange={(e) => setForm({ ...form, data_movimento: e.target.value })} className="h-8 text-sm" />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" className="h-8 gap-1" onClick={() => setExibirForm(false)}><X className="h-3.5 w-3.5" /> Cancelar</Button>
            <Button size="sm" className="bg-[#253B29] hover:bg-[#1a2b1e] text-white h-8 gap-1" onClick={salvar} disabled={!form.descricao.trim() || !form.valor || adicionarMovimento.isPending}>
              <Check className="h-3.5 w-3.5" /> Registrar
            </Button>
          </div>
        </div>
      )}

      {/* Tabela de movimentos */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <p className="text-sm font-semibold text-[#253B29]">Extrato</p>
        </div>
        {isLoading ? (
          <div className="p-4 space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-8 bg-gray-100 animate-pulse rounded" />)}</div>
        ) : movimentos.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">Nenhum lançamento.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {['Data','Tipo','Descrição','Valor','Por'].map((h) => (
                  <th key={h} className="text-left text-xs text-gray-500 font-medium px-4 py-2.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {movimentos.map((m) => (
                <tr key={m.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                    {new Date(m.data_movimento).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge
                      variant="outline"
                      className={m.tipo === 'credito'
                        ? 'text-xs bg-green-50 text-green-700 border-green-200'
                        : 'text-xs bg-orange-50 text-orange-700 border-orange-200'}
                    >
                      {m.tipo === 'credito' ? 'Crédito' : 'Débito'}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-[#253B29]">{m.descricao}</td>
                  <td className={`px-4 py-2.5 font-medium ${m.tipo === 'credito' ? 'text-green-700' : 'text-orange-700'}`}>
                    {m.tipo === 'credito' ? '+' : '-'}{fmtMoeda(m.valor)}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-400">{m.usuario?.nome ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}