'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useFuncionarios } from '@/hooks/rh/useFuncionarios'
import { usePonto, useRegistrarPonto } from '@/hooks/rh/usePonto'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { LogIn, Coffee, CoffeeIcon, LogOut } from 'lucide-react'

export function PontoTab() {
  const [funcionarioId, setFuncionarioId] = useState<string>('todos')
  const [data, setData] = useState(format(new Date(), 'yyyy-MM-dd'))
  const { data: funcionarios = [] } = useFuncionarios({ status: 'ativo' })
  const { data: pontos = [], isLoading } = usePonto(data)
  const registrar = useRegistrarPonto()

  const agora = format(new Date(), 'HH:mm')
  const funcSelecionado = funcionarioId !== 'todos' ? funcionarios.find(f => f.id === funcionarioId) : null

  async function bater(campo: 'entrada' | 'inicio_intervalo' | 'fim_intervalo' | 'saida') {
    if (!funcSelecionado) { toast.error('Selecione um funcionário para registrar ponto.'); return }
    try {
      await registrar.mutateAsync({ funcionario_id: funcSelecionado.id, data, campo, horario: agora })
      const labels = { entrada: 'Entrada', inicio_intervalo: 'Início do intervalo', fim_intervalo: 'Fim do intervalo', saida: 'Saída' }
      toast.success(`${labels[campo]} registrada: ${agora}`)
    } catch {
      toast.error('Erro ao registrar ponto.')
    }
  }

  const pontosFiltrados = funcionarioId === 'todos'
    ? pontos
    : pontos.filter(p => p.funcionario_id === funcionarioId)

  function calcTotal(p: typeof pontos[0]) {
    if (!p.entrada || !p.saida) return '—'
    const [eh, em] = p.entrada.split(':').map(Number)
    const [sh, sm] = p.saida.split(':').map(Number)
    const intMin = p.inicio_intervalo && p.fim_intervalo
      ? (() => {
          const [ih, im] = p.inicio_intervalo.split(':').map(Number)
          const [fh, fm] = p.fim_intervalo.split(':').map(Number)
          return (fh * 60 + fm) - (ih * 60 + im)
        })()
      : 0
    const totalMin = (sh * 60 + sm) - (eh * 60 + em) - intMin
    const h = Math.floor(totalMin / 60)
    const m = totalMin % 60
    return `${h}h ${m > 0 ? `${m}m` : ''}`.trim()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={funcionarioId} onValueChange={setFuncionarioId}>
          <SelectTrigger className="w-56 h-9">
            <SelectValue placeholder="Todos os funcionários" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os funcionários</SelectItem>
            {funcionarios.map(f => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="date" className="w-44 h-9 text-sm" value={data} onChange={e => setData(e.target.value)} />

        {funcSelecionado && (
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <Button size="sm" variant="outline" className="h-9 border-green-300 text-green-700 hover:bg-green-50 gap-1.5" onClick={() => bater('entrada')}>
              <LogIn className="h-3.5 w-3.5" /> Entrada
            </Button>
            <Button size="sm" variant="outline" className="h-9 border-orange-300 text-orange-700 hover:bg-orange-50 gap-1.5" onClick={() => bater('inicio_intervalo')}>
              <Coffee className="h-3.5 w-3.5" /> Início Intervalo
            </Button>
            <Button size="sm" variant="outline" className="h-9 border-orange-300 text-orange-700 hover:bg-orange-50 gap-1.5" onClick={() => bater('fim_intervalo')}>
              <CoffeeIcon className="h-3.5 w-3.5" /> Fim Intervalo
            </Button>
            <Button size="sm" variant="outline" className="h-9 border-red-300 text-red-700 hover:bg-red-50 gap-1.5" onClick={() => bater('saida')}>
              <LogOut className="h-3.5 w-3.5" /> Saída
            </Button>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {isLoading ? (
          <p className="p-8 text-center text-sm text-gray-400">Carregando...</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Funcionário</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Entrada</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Intervalo</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Retorno</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Saída</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Total</th>
              </tr>
            </thead>
            <tbody>
              {funcionarios
                .filter(f => funcionarioId === 'todos' || f.id === funcionarioId)
                .map(f => {
                  const p = pontos.find(pt => pt.funcionario_id === f.id)
                  const ativo = funcionarioId === f.id
                  return (
                    <tr key={f.id} className={cn('border-b border-gray-50 last:border-0', ativo && 'bg-amber-50/50')}>
                      <td className="px-4 py-3 text-sm font-medium text-gray-800">{f.nome}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{p?.entrada ?? '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{p?.inicio_intervalo ?? '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{p?.fim_intervalo ?? '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{p?.saida ?? '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{p ? calcTotal(p) : '—'}</td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
