'use client'

import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { useRelatorioProducaoMensal } from '@/hooks/relatorios/useRelatorioProducaoMensal'
import { exportarCsv } from '@/lib/exportarCsv'
import { Button } from '@/components/ui/button'
import { Download } from 'lucide-react'

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

interface AbaProducaoGeralProps {
  ano: number
}

export function AbaProducaoGeral({ ano }: AbaProducaoGeralProps) {
  const { data = [], isLoading } = useRelatorioProducaoMensal(ano)

  const dadosGrafico = data.map((d) => ({
    mes: MESES[d.mes - 1],
    'Valor Emitido (R$)': d.valor_total,
    'Contratos': d.emissoes,
    'Taxa Conversão (%)': d.leads_criados > 0
      ? Number(((d.leads_convertidos / d.leads_criados) * 100).toFixed(1))
      : 0,
  }))

  const totalEmissoes = data.reduce((s, d) => s + d.emissoes, 0)
  const totalValor = data.reduce((s, d) => s + d.valor_total, 0)
  const ticketMedio = totalEmissoes > 0 ? totalValor / totalEmissoes : 0
  const totalLeads = data.reduce((s, d) => s + d.leads_criados, 0)
  const totalConvertidos = data.reduce((s, d) => s + d.leads_convertidos, 0)
  const taxaConversao = totalLeads > 0 ? ((totalConvertidos / totalLeads) * 100).toFixed(1) : '0'

  function handleExportar() {
    const rows = data.map((d) => ({
      Mês: MESES[d.mes - 1],
      Emissões: d.emissoes,
      'Valor Total (R$)': d.valor_total.toFixed(2),
      'Ticket Médio (R$)': d.emissoes > 0 ? (d.valor_total / d.emissoes).toFixed(2) : '0,00',
      'Leads Criados': d.leads_criados,
      'Leads Convertidos': d.leads_convertidos,
      'Taxa Conversão (%)': d.leads_criados > 0
        ? ((d.leads_convertidos / d.leads_criados) * 100).toFixed(1)
        : '0',
    }))
    exportarCsv(rows, `relatorio-producao-${ano}`)
  }

  if (isLoading) {
    return <div className="py-12 text-center text-gray-500">Carregando...</div>
  }

  return (
    <div className="space-y-6">
      {/* Gráfico de barras — emissões + valor */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-700">Emissões por Mês — {ano}</h3>
          <Button size="sm" variant="outline" onClick={handleExportar} className="gap-1 text-xs">
            <Download className="w-3 h-3" /> Exportar CSV
          </Button>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={dadosGrafico}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
            <YAxis yAxisId="left" tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(value, name) =>
                name === 'Valor Emitido (R$)'
                  ? [`R$ ${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, name]
                  : [value, name]
              }
            />
            <Legend />
            <Bar yAxisId="left" dataKey="Valor Emitido (R$)" fill="var(--fonti-primary)" radius={[3, 3, 0, 0]} />
            <Bar yAxisId="right" dataKey="Contratos" fill="var(--fonti-accent)" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Gráfico de linha — taxa de conversão */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Tendência de Conversão Leads → Processos</h3>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={dadosGrafico}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
            <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} domain={[0, 100]} />
            <Tooltip formatter={(v) => [`${v}%`, 'Taxa de Conversão']} />
            <Line
              type="monotone"
              dataKey="Taxa Conversão (%)"
              stroke="var(--fonti-accent)"
              strokeWidth={2}
              dot={{ fill: 'var(--fonti-accent)', r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Tabela sumário */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Resumo do Período</h3>
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-fonti-primary text-white">
                <th className="px-4 py-2 text-left">Período</th>
                <th className="px-4 py-2 text-right">Emissões</th>
                <th className="px-4 py-2 text-right">Valor Total</th>
                <th className="px-4 py-2 text-right">Ticket Médio</th>
                <th className="px-4 py-2 text-right">Taxa de Conversão</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.mes} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-2">{MESES[d.mes - 1]}/{ano}</td>
                  <td className="px-4 py-2 text-right">{d.emissoes}</td>
                  <td className="px-4 py-2 text-right">
                    {d.valor_total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {d.emissoes > 0
                      ? (d.valor_total / d.emissoes).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                      : '—'}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {d.leads_criados > 0
                      ? `${((d.leads_convertidos / d.leads_criados) * 100).toFixed(1)}%`
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t font-semibold">
                <td className="px-4 py-2">Total {ano}</td>
                <td className="px-4 py-2 text-right">{totalEmissoes}</td>
                <td className="px-4 py-2 text-right">
                  {totalValor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </td>
                <td className="px-4 py-2 text-right">
                  {totalEmissoes > 0
                    ? ticketMedio.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                    : '—'}
                </td>
                <td className="px-4 py-2 text-right">{taxaConversao}%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}