'use client'

import { useResumoEstoque } from '@/hooks/processos/useResumoEstoque'
import { CheckCircle, HelpCircle, Package } from 'lucide-react'

function formatarMoeda(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)
}

export function ResumoEstoque() {
  const { data, isLoading } = useResumoEstoque()

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <div key={i} className="h-24 bg-gray-100 rounded-xl" />)}
        </div>
      </div>
    )
  }

  const resumo = data?.resumo
  const bancos = data?.bancos ?? []

  const kpis = [
    {
      label: 'Certeza', total: resumo?.certeza_total ?? 0, valor: resumo?.certeza_valor ?? 0,
      icone: CheckCircle, className: 'bg-green-50 border-green-200 text-green-700',
    },
    {
      label: 'Incerteza', total: resumo?.incerteza_total ?? 0, valor: resumo?.incerteza_valor ?? 0,
      icone: HelpCircle, className: 'bg-amber-50 border-amber-200 text-amber-700',
    },
    {
      label: 'Total em Estoque', total: resumo?.total_estoque ?? 0, valor: resumo?.total_valor ?? 0,
      icone: Package, className: 'bg-blue-50 border-blue-200 text-blue-700',
    },
  ]

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-fonti-primary">Resumo do Estoque</h3>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {kpis.map(({ label, total, valor, icone: Icone, className }) => (
          <div key={label} className={`border rounded-xl p-4 ${className}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">{label}</span>
              <Icone className="h-5 w-5 opacity-60" />
            </div>
            <p className="text-2xl font-bold">{total}</p>
            <p className="text-sm opacity-75 mt-0.5">{formatarMoeda(valor)}</p>
          </div>
        ))}
      </div>

      {/* Performance por Banco */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <p className="text-sm font-semibold text-fonti-primary">Performance por Banco</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              {['Banco','Realizado (R$)','% Valor','Nº Contratos','% Contratos'].map((h) => (
                <th key={h} className="text-left text-xs text-gray-500 font-medium px-4 py-2.5">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bancos.map((b) => (
              <tr key={b.banco_nome} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: b.banco_cor ?? '#94a3b8' }}
                    />
                    <span className="text-fonti-primary">{b.banco_nome}</span>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-blue-600 font-medium">
                  {formatarMoeda(b.realizado)}
                </td>
                <td className="px-4 py-2.5 text-gray-600">{b.percentual_valor.toFixed(2)}%</td>
                <td className="px-4 py-2.5 font-medium text-fonti-primary">{b.num_contratos}</td>
                <td className="px-4 py-2.5 text-gray-600">{b.percentual_contratos.toFixed(2)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}