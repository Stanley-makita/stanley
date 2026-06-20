'use client'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { useRelatorioPorEquipe } from '@/hooks/relatorios/useRelatorioPorEquipe'
import { exportarCsv } from '@/lib/exportarCsv'
import { Button } from '@/components/ui/button'
import { Download } from 'lucide-react'
import { PeriodoRelatorio } from '@/types/relatorios'

const MEDALHA: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }

interface AbaRelPorEquipeProps {
  periodo: PeriodoRelatorio
}

export function AbaRelPorEquipe({ periodo }: AbaRelPorEquipeProps) {
  const { data = [], isLoading } = useRelatorioPorEquipe(periodo.dataInicio, periodo.dataFim)

  const dadosGrafico = data.map((d) => ({
    nome: d.comercial_nome.split(' ')[0], // primeiro nome para caber no gráfico
    'Valor Emitido': d.valor_emitido,
    'Comissão': d.comissao,
  }))

  function handleExportar() {
    const rows = data.map((d) => ({
      Posição: d.posicao,
      Comercial: d.comercial_nome,
      Contratos: d.num_contratos,
      'Valor Emitido (R$)': d.valor_emitido.toFixed(2),
      'Comissão (R$)': d.comissao.toFixed(2),
      'Taxa de Conversão (%)': `${d.taxa_conversao.toFixed(1)}%`,
    }))
    exportarCsv(rows, `relatorio-por-equipe-${periodo.dataInicio}-${periodo.dataFim}`)
  }

  if (isLoading) {
    return <div className="py-12 text-center text-gray-500">Carregando...</div>
  }

  if (data.length === 0) {
    return <div className="py-12 text-center text-gray-400">Nenhum dado para o período selecionado.</div>
  }

  return (
    <div className="space-y-6">
      {/* Gráfico de barras agrupadas */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Desempenho por Comercial</h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={dadosGrafico}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="nome" tick={{ fontSize: 12 }} />
            <YAxis tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(v, name) => [
                Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
                name,
              ]}
            />
            <Legend />
            <Bar dataKey="Valor Emitido" fill="var(--fonti-primary)" radius={[3, 3, 0, 0]} />
            <Bar dataKey="Comissão" fill="var(--fonti-accent)" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Tabela ranqueada */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-700">Ranking da Equipe</h3>
          <Button size="sm" variant="outline" onClick={handleExportar} className="gap-1 text-xs">
            <Download className="w-3 h-3" /> Exportar CSV
          </Button>
        </div>
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-fonti-primary text-white">
                <th className="px-4 py-2 text-center w-12">Pos.</th>
                <th className="px-4 py-2 text-left">Comercial</th>
                <th className="px-4 py-2 text-right">Contratos</th>
                <th className="px-4 py-2 text-right">Valor Emitido</th>
                <th className="px-4 py-2 text-right">Comissão</th>
                <th className="px-4 py-2 text-right">Taxa de Conversão</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr
                  key={d.comercial_id}
                  className={`border-t hover:bg-gray-50 ${d.posicao === 1 ? 'bg-amber-50' : ''}`}
                >
                  <td className="px-4 py-2 text-center font-bold">
                    {MEDALHA[d.posicao] ?? `#${d.posicao}`}
                  </td>
                  <td className="px-4 py-2 font-medium">{d.comercial_nome}</td>
                  <td className="px-4 py-2 text-right">{d.num_contratos}</td>
                  <td className="px-4 py-2 text-right">
                    {d.valor_emitido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {d.comissao.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </td>
                  <td className="px-4 py-2 text-right">{d.taxa_conversao.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}