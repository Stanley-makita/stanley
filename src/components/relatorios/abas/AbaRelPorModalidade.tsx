'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { useRelatorioPorModalidade } from '@/hooks/relatorios/useRelatorioPorModalidade'
import { exportarCsv } from '@/lib/exportarCsv'
import { Button } from '@/components/ui/button'
import { Download } from 'lucide-react'
import { PeriodoRelatorio } from '@/types/relatorios'

const LABEL_MODALIDADE: Record<string, string> = {
  sfi: 'SFI',
  sbpe: 'SBPE',
  pmcmv: 'PMCMV',
  pro_cotista: 'Pró-Cotista',
  cgi: 'CGI',
  contrato: 'Contrato',
}

interface AbaRelPorModalidadeProps {
  periodo: PeriodoRelatorio
}

export function AbaRelPorModalidade({ periodo }: AbaRelPorModalidadeProps) {
  const { data = [], isLoading } = useRelatorioPorModalidade(periodo.dataInicio, periodo.dataFim)

  const dadosGrafico = data.map((d) => ({
    modalidade: LABEL_MODALIDADE[d.modalidade] ?? d.modalidade,
    'Valor Total': d.valor_total,
    'Nº Contratos': d.num_contratos,
  }))

  function handleExportar() {
    const rows = data.map((d) => ({
      Modalidade: LABEL_MODALIDADE[d.modalidade] ?? d.modalidade,
      'Nº Contratos': d.num_contratos,
      'Valor Total (R$)': d.valor_total.toFixed(2),
      '% do Total': `${d.pct_total.toFixed(1)}%`,
    }))
    exportarCsv(rows, `relatorio-por-modalidade-${periodo.dataInicio}-${periodo.dataFim}`)
  }

  if (isLoading) {
    return <div className="py-12 text-center text-gray-500">Carregando...</div>
  }

  if (data.length === 0) {
    return <div className="py-12 text-center text-gray-400">Nenhum dado para o período selecionado.</div>
  }

  return (
    <div className="space-y-6">
      {/* Gráfico de barras horizontais */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Valor Emitido por Modalidade</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart layout="vertical" data={dadosGrafico} margin={{ left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              type="number"
              tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`}
              tick={{ fontSize: 11 }}
            />
            <YAxis type="category" dataKey="modalidade" width={90} tick={{ fontSize: 12 }} />
            <Tooltip
              formatter={(v, name) =>
                name === 'Valor Total'
                  ? [Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), name]
                  : [v, name]
              }
            />
            <Legend />
            <Bar dataKey="Valor Total" fill="#253B29" radius={[0, 3, 3, 0]} />
            <Bar dataKey="Nº Contratos" fill="#C2AA6A" radius={[0, 3, 3, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Tabela */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-700">Detalhamento por Modalidade</h3>
          <Button size="sm" variant="outline" onClick={handleExportar} className="gap-1 text-xs">
            <Download className="w-3 h-3" /> Exportar CSV
          </Button>
        </div>
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#253B29] text-white">
                <th className="px-4 py-2 text-left">Modalidade</th>
                <th className="px-4 py-2 text-right">Nº Contratos</th>
                <th className="px-4 py-2 text-right">Valor Total</th>
                <th className="px-4 py-2 text-right">% do Total</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.modalidade} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium">{LABEL_MODALIDADE[d.modalidade] ?? d.modalidade}</td>
                  <td className="px-4 py-2 text-right">{d.num_contratos}</td>
                  <td className="px-4 py-2 text-right">
                    {d.valor_total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </td>
                  <td className="px-4 py-2 text-right">{d.pct_total.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}