'use client'

import { useState } from 'react'
import { fmtData } from '@/lib/utils'
import { useLancamentos, useAdicionarLancamento, useRemoverLancamento } from '@/hooks/financeiro/useLancamentos'
import { type TipoLancamento } from '@/types/financeiro'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Plus, Trash2, TrendingUp, TrendingDown, X, Check } from 'lucide-react'

function fmtMoeda(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

const CATEGORIAS_RECEITA = ['Comissão Recebida', 'Consultoria', 'Honorários', 'Outros']
const CATEGORIAS_DESPESA = ['Aluguel', 'Salários', 'Marketing', 'Software', 'Impostos', 'Outros']

interface Props { mes: number; ano: number }

export function VisaoFluxoCaixa({ mes, ano }: Props) {
  const { data: lancamentos = [], isLoading } = useLancamentos(mes, ano)
  const adicionar = useAdicionarLancamento()
  const remover = useRemoverLancamento()

  const [exibirForm, setExibirForm] = useState(false)
  const [form, setForm] = useState({
    tipo: 'receita' as TipoLancamento,
    categoria: '',
    descricao: '',
    valor: '',
    data_lancamento: new Date().toISOString().slice(0, 10),
  })

  const totalReceitas = lancamentos.filter((l) => l.tipo === 'receita').reduce((s, l) => s + l.valor, 0)
  const totalDespesas = lancamentos.filter((l) => l.tipo === 'despesa').reduce((s, l) => s + l.valor, 0)
  const saldo = totalReceitas - totalDespesas

  const categorias = form.tipo === 'receita' ? CATEGORIAS_RECEITA : CATEGORIAS_DESPESA

  async function salvar() {
    if (!form.categoria || !form.descricao.trim() || !form.valor) return
    await adicionar.mutateAsync({
      tipo: form.tipo,
      categoria: form.categoria,
      descricao: form.descricao.trim(),
      valor: Number(form.valor),
      data_lancamento: form.data_lancamento,
    })
    setForm({ tipo: 'receita', categoria: '', descricao: '', valor: '', data_lancamento: new Date().toISOString().slice(0, 10) })
    setExibirForm(false)
  }

  return (
    <div className="space-y-5">
      {/* Resumo */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-500">Receitas</span>
            <TrendingUp className="h-4 w-4 text-blue-600" />
          </div>
          <p className="text-xl font-bold text-blue-700">{fmtMoeda(totalReceitas)}</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-500">Despesas</span>
            <TrendingDown className="h-4 w-4 text-red-500" />
          </div>
          <p className="text-xl font-bold text-red-600">{fmtMoeda(totalDespesas)}</p>
        </div>
        <div className={`border rounded-xl p-4 ${saldo >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <p className="text-xs text-gray-500 mb-1">Saldo</p>
          <p className={`text-xl font-bold ${saldo >= 0 ? 'text-green-700' : 'text-red-600'}`}>{fmtMoeda(saldo)}</p>
        </div>
      </div>

      <div className="flex justify-end">
        <Button size="sm" className="bg-[#253B29] hover:bg-[#1a2b1e] text-white gap-1.5 h-8" onClick={() => setExibirForm(!exibirForm)}>
          <Plus className="h-3.5 w-3.5" /> Novo Lançamento
        </Button>
      </div>

      {exibirForm && (
        <div className="border border-[#C2AA6A] rounded-xl p-4 bg-[#E7E0C4]/20 space-y-3">
          <p className="text-xs font-semibold text-[#253B29]">Novo lançamento</p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v as TipoLancamento, categoria: '' })}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="receita">Receita</SelectItem>
                <SelectItem value="despesa">Despesa</SelectItem>
              </SelectContent>
            </Select>
            <Select value={form.categoria} onValueChange={(v) => setForm({ ...form, categoria: v })}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent>
                {categorias.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input placeholder="Descrição" value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} className="h-8 text-sm" />
            <Input type="number" placeholder="Valor" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} className="h-8 text-sm" />
            <Input type="date" value={form.data_lancamento} onChange={(e) => setForm({ ...form, data_lancamento: e.target.value })} className="h-8 text-sm" />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" className="h-8 gap-1" onClick={() => setExibirForm(false)}><X className="h-3.5 w-3.5" /> Cancelar</Button>
            <Button size="sm" className="bg-[#253B29] hover:bg-[#1a2b1e] text-white h-8 gap-1" onClick={salvar} disabled={!form.categoria || !form.descricao.trim() || !form.valor || adicionar.isPending}>
              <Check className="h-3.5 w-3.5" /> Registrar
            </Button>
          </div>
        </div>
      )}

      {/* Tabela */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-9 bg-gray-100 animate-pulse rounded" />)}</div>
        ) : lancamentos.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">Nenhum lançamento no período.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {['Data','Tipo','Categoria','Descrição','Valor','Por',''].map((h) => (
                  <th key={h} className="text-left text-xs text-gray-500 font-medium px-4 py-2.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lancamentos.map((l) => (
                <tr key={l.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                    {fmtData(l.data_lancamento)}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge
                      variant="outline"
                      className={l.tipo === 'receita'
                        ? 'text-xs bg-blue-50 text-blue-700 border-blue-200'
                        : 'text-xs bg-red-50 text-red-600 border-red-200'}
                    >
                      {l.tipo === 'receita' ? 'Receita' : 'Despesa'}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-500">{l.categoria}</td>
                  <td className="px-4 py-2.5 text-[#253B29]">{l.descricao}</td>
                  <td className={`px-4 py-2.5 font-medium whitespace-nowrap ${l.tipo === 'receita' ? 'text-blue-700' : 'text-red-600'}`}>
                    {l.tipo === 'receita' ? '+' : '-'}{fmtMoeda(l.valor)}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-400">{l.usuario?.nome ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-gray-300 hover:text-red-500"
                      onClick={() => remover.mutate(l.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
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