'use client'

import { useState } from 'react'
import { Calculator, Plus, Building2, TrendingUp, CheckCircle2, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'
import { SimuladorFinanciamento } from '@/components/simuladorFinanciamento/SimuladorFinanciamento'
import { SimuladorCustas } from '@/components/simulador/SimuladorCustas'
import { useSimulacoesCentral } from '@/hooks/simulacoes/useSimulacoesCentral'
import { useSalvarSimulacaoCentral } from '@/hooks/simulacoes/useSalvarSimulacaoCentral'
import type { ResultadoCompleto } from '@/lib/simuladorFinanciamento/tipos'

type TipoModal = null | 'escolha' | 'custas' | 'financiamento'

function fmtData(iso: string) {
  try {
    return format(new Date(iso), "dd/MM/yy 'às' HH:mm", { locale: ptBR })
  } catch {
    return '—'
  }
}

function BadgeTipo({ tipo }: { tipo: 'custas' | 'financiamento' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        tipo === 'custas'
          ? 'bg-blue-50 text-blue-700 border border-blue-200'
          : 'bg-green-50 text-green-700 border border-green-200'
      )}
    >
      {tipo === 'custas' ? <Building2 className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
      {tipo === 'custas' ? 'Custas' : 'Financiamento'}
    </span>
  )
}

function BadgeStatus({ status }: { status: 'aguardando' | 'concluida' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        status === 'concluida'
          ? 'bg-gray-50 text-gray-600 border border-gray-200'
          : 'bg-amber-50 text-amber-700 border border-amber-200'
      )}
    >
      {status === 'concluida'
        ? <CheckCircle2 className="w-3 h-3" />
        : <Clock className="w-3 h-3" />}
      {status === 'concluida' ? 'Concluída' : 'Aguardando'}
    </span>
  )
}

export default function SimuladoresPage() {
  const [modal, setModal] = useState<TipoModal>(null)
  const { data: simulacoes = [], isLoading } = useSimulacoesCentral()
  const salvar = useSalvarSimulacaoCentral()

  const total      = simulacoes.length
  const aguardando = simulacoes.filter((s) => s.status === 'aguardando').length
  const concluidas = simulacoes.filter((s) => s.status === 'concluida').length

  async function handleSalvarFinanciamento(resultado: ResultadoCompleto) {
    try {
      await salvar.mutateAsync(resultado)
      toast.success('Simulação salva no histórico')
      setModal(null)
    } catch {
      toast.error('Erro ao salvar simulação')
    }
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#253B29] flex items-center justify-center">
            <Calculator className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Central de Simulações</h1>
            <p className="text-xs text-gray-400">Custas cartoriais e financiamento bancário</p>
          </div>
        </div>
        <Button
          className="bg-[#253B29] hover:bg-[#1a2b1e] text-white gap-2"
          onClick={() => setModal('escolha')}
        >
          <Plus className="w-4 h-4" />
          Nova Simulação
        </Button>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-3 gap-4">
        <SummaryCard label="Total" value={total} icon={<Calculator className="w-4 h-4 text-gray-400" />} />
        <SummaryCard label="Aguardando" value={aguardando} icon={<Clock className="w-4 h-4 text-amber-500" />} cor="amber" />
        <SummaryCard label="Concluídas" value={concluidas} icon={<CheckCircle2 className="w-4 h-4 text-green-500" />} cor="green" />
      </div>

      {/* Tabela de histórico */}
      <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Histórico</p>
        </div>

        {isLoading ? (
          <div className="px-4 py-8 text-center text-sm text-gray-400">Carregando...</div>
        ) : simulacoes.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <Calculator className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="text-sm text-gray-400">Nenhuma simulação ainda</p>
            <p className="text-xs text-gray-300 mt-1">Clique em &quot;Nova Simulação&quot; para começar</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Data</th>
                  <th className="px-4 py-2.5 text-left font-medium">Tipo</th>
                  <th className="px-4 py-2.5 text-left font-medium">Cliente</th>
                  <th className="px-4 py-2.5 text-left font-medium">Banco / Referência</th>
                  <th className="px-4 py-2.5 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {simulacoes.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                      {fmtData(s.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <BadgeTipo tipo={s.tipo} />
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-800">{s.nome_cliente || '—'}</p>
                      {s.cpf_cliente && (
                        <p className="text-xs text-gray-400">{s.cpf_cliente}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{s.banco || '—'}</td>
                    <td className="px-4 py-3">
                      <BadgeStatus status={s.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: escolha de tipo */}
      <Dialog open={modal === 'escolha'} onOpenChange={(o) => !o && setModal(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Nova Simulação</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-500 mb-4">Escolha o tipo de simulação:</p>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setModal('custas')}
              className="flex flex-col items-center gap-3 rounded-xl border-2 border-gray-100 p-5 hover:border-[#253B29] hover:bg-[#253B29]/5 transition-all group"
            >
              <Building2 className="w-8 h-8 text-blue-500 group-hover:scale-110 transition-transform" />
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-800">Custas</p>
                <p className="text-xs text-gray-400 mt-0.5">Cartório, ITBI, escritura</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setModal('financiamento')}
              className="flex flex-col items-center gap-3 rounded-xl border-2 border-gray-100 p-5 hover:border-[#253B29] hover:bg-[#253B29]/5 transition-all group"
            >
              <TrendingUp className="w-8 h-8 text-green-500 group-hover:scale-110 transition-transform" />
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-800">Financiamento</p>
                <p className="text-xs text-gray-400 mt-0.5">SAC, PRICE, 7 bancos</p>
              </div>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal: SimuladorCustas */}
      <Dialog open={modal === 'custas'} onOpenChange={(o) => !o && setModal(null)}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto p-0">
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-blue-500" />
              Simulador de Custas
            </DialogTitle>
          </DialogHeader>
          <div className="px-6 py-4">
            <SimuladorCustas />
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal: SimuladorFinanciamento */}
      <Dialog open={modal === 'financiamento'} onOpenChange={(o) => !o && setModal(null)}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-green-500" />
              Simulador de Financiamento Bancário
            </DialogTitle>
          </DialogHeader>
          <SimuladorFinanciamento
            onSalvar={handleSalvarFinanciamento}
            salvando={salvar.isPending}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SummaryCard({
  label, value, icon, cor,
}: {
  label: string
  value: number
  icon: React.ReactNode
  cor?: 'amber' | 'green'
}) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 flex items-center gap-3">
      <div className={cn(
        'w-9 h-9 rounded-lg flex items-center justify-center',
        cor === 'amber' ? 'bg-amber-50'
        : cor === 'green' ? 'bg-green-50'
        : 'bg-gray-50'
      )}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-xs text-gray-400">{label}</p>
      </div>
    </div>
  )
}
