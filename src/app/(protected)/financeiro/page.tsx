'use client'

import { useState } from 'react'
import { useKpisFinanceiro } from '@/hooks/financeiro/useKpisFinanceiro'
import { VisaoComissoes } from '@/components/financeiro/visoes/VisaoComissoes'
import { VisaoFluxoCaixa } from '@/components/financeiro/visoes/VisaoFluxoCaixa'
import { VisaoRelatorioEquipe } from '@/components/financeiro/visoes/VisaoRelatorioEquipe'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, DollarSign, Clock, TrendingDown, BarChart3 } from 'lucide-react'

type Visao = 'comissoes' | 'fluxo' | 'equipe'

function fmtMoeda(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)
}

export default function FinanceiroPage() {
  const [data, setData] = useState(new Date())
  const [visao, setVisao] = useState<Visao>('comissoes')

  const mes = data.getMonth() + 1
  const ano = data.getFullYear()
  const nomeMes = data.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  const { data: kpis, isLoading: kpisLoading } = useKpisFinanceiro(mes, ano)

  function navegar(dir: -1 | 1) {
    setData((d) => {
      const nova = new Date(d)
      nova.setMonth(nova.getMonth() + dir)
      return nova
    })
  }

  const kpiCards = [
    {
      label: 'Receita do Mês',
      valor: kpis?.receita_mes ?? 0,
      icone: DollarSign,
      className: 'bg-blue-50 border-blue-200 text-blue-700',
      iconClass: 'text-blue-600',
    },
    {
      label: 'A Receber',
      valor: kpis?.a_receber ?? 0,
      icone: Clock,
      className: 'bg-amber-50 border-amber-200 text-amber-700',
      iconClass: 'text-amber-600',
    },
    {
      label: 'Despesas',
      valor: kpis?.despesas_mes ?? 0,
      icone: TrendingDown,
      className: 'bg-red-50 border-red-200 text-red-700',
      iconClass: 'text-red-500',
    },
    {
      label: 'Resultado Líquido',
      valor: kpis?.resultado_liquido ?? 0,
      icone: BarChart3,
      className: (kpis?.resultado_liquido ?? 0) >= 0
        ? 'bg-green-50 border-green-200 text-green-700'
        : 'bg-red-50 border-red-200 text-red-700',
      iconClass: (kpis?.resultado_liquido ?? 0) >= 0 ? 'text-green-600' : 'text-red-500',
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#253B29]">Financeiro</h1>
          <p className="text-sm text-gray-500">Comissões, lançamentos e produção da equipe</p>
        </div>

        {/* Navegação de mês */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navegar(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium text-[#253B29] min-w-[160px] text-center capitalize">
            {nomeMes}
          </span>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navegar(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpiCards.map(({ label, valor, icone: Icone, className, iconClass }) => (
          <div key={label} className={`rounded-xl border p-4 ${className}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-gray-500">{label}</span>
              <Icone className={`h-4 w-4 ${iconClass}`} />
            </div>
            {kpisLoading ? (
              <div className="h-7 bg-current opacity-10 animate-pulse rounded" />
            ) : (
              <p className="text-2xl font-bold">{fmtMoeda(valor)}</p>
            )}
          </div>
        ))}
      </div>

      {/* Toggle de visão */}
      <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden w-fit">
        {([
          { key: 'comissoes', label: 'Comissões' },
          { key: 'fluxo',     label: 'Fluxo de Caixa' },
          { key: 'equipe',    label: 'Equipe' },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setVisao(key)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              visao === key ? 'bg-[#253B29] text-white' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Conteúdo da visão */}
      {visao === 'comissoes' && <VisaoComissoes mes={mes} ano={ano} />}
      {visao === 'fluxo'     && <VisaoFluxoCaixa mes={mes} ano={ano} />}
      {visao === 'equipe'    && <VisaoRelatorioEquipe mes={mes} ano={ano} />}
    </div>
  )
}