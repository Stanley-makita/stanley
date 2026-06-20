'use client'

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { useRelatorioPorBanco } from '@/hooks/relatorios/useRelatorioPorBanco'
import { exportarCsv } from '@/lib/exportarCsv'
import { Button } from '@/components/ui/button'
import { Download } from 'lucide-react'
import { PeriodoRelatorio } from '@/types/relatorios'

const CORES = ['var(--fonti-primary)', 'var(--fonti-accent)', '#4A7C59', 'var(--fonti-accent-hover)', '#6B9080', '#A4C3B2', '#84A98C']

interface AbaRelPorBancoProps {
  periodo: PeriodoRelatorio
}

export function AbaRelPorBanco({ periodo }: AbaRelPorBancoProps) {
  const { data = [], isLoading } = useRelatorioPorBanco(periodo.dataInicio, periodo.dataFim)

  const dadosPizza = data.map((d) => ({
    name: d.banco_nome,
    value: d.valor_total,
  }))

  function handleExportar() {
    const rows = data.map((d) => ({
      Banco: d.banco_nome,
      'Nº Contratos': d.num_contratos,
      'Valor Emitido (R$)': d.valor_total.toFixed(2),
      '% do Total': `${d.pct_total.toFixed(1)}%`,
      'Ticket Médio (R$)': d.ticket_medio.toFixed(2),
      'Comissão Gerada (R$)': d.comissao_gerada.toFixed(2),
    }))
    exportarCsv(rows, `relatorio-por-banco-${periodo.dataInicio}-${periodo.dataFim}`)
  }

  if (isLoading) {
    return <div className="py-12 text-center text-gray-500">Carregando...</div>
  }

  if (data.length === 0) {
    return <div className="py-12 text-center text-gray-400">Nenhum dado para o período selecionado.</div>
  }

  return (
    <div className="space-y-6">
      {/* Gráfico de pizza */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Share de Valor Emitido por Banco</h3>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={dadosPizza}
              cx="50%"
              cy="50%"
              outerRadius={110}
              dataKey="value"
              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              labelLine={false}
            >
              {dadosPizza.map((_, idx) => (
                <Cell key={idx} fill={CORES[idx % CORES.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(v) =>
                Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
              }
            />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Tabela detalhada */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-700">Detalhamento por Banco</h3>
          <Button size="sm" variant="outline" onClick={handleExportar} className="gap-1 text-xs">
            <Download className="w-3 h-3" /> Exportar CSV
          </Button>
        </div>
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-fonti-primary text-white">
                <th className="px-4 py-2 text-left">Banco</th>
                <th className="px-4 py-2 text-right">Nº Contratos</th>
                <th className="px-4 py-2 text-right">Valor Emitido</th>
                <th className="px-4 py-2 text-right">% do Total</th>
                <th className="px-4 py-2 text-right">Ticket Médio</th>
                <th className="px-4 py-2 text-right">Comissão Gerada</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.banco_id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium">{d.banco_nome}</td>
                  <td className="px-4 py-2 text-right">{d.num_contratos}</td>
                  <td className="px-4 py-2 text-right">
                    {d.valor_total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </td>
                  <td className="px-4 py-2 text-right">{d.pct_total.toFixed(1)}%</td>
                  <td className="px-4 py-2 text-right">
                    {d.ticket_medio.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {d.comissao_gerada.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}