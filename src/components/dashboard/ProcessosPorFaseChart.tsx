'use client'

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { useProcessosPorFase } from '@/hooks/dashboard/useDashboard'

export function ProcessosPorFaseChart() {
  const { data, isLoading } = useProcessosPorFase()

  if (isLoading) {
    return (
      <div className="animate-pulse bg-gray-100 rounded-xl h-64 w-full" />
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-fonti-primary mb-4">Processos por fase</h3>

      <ResponsiveContainer width="100%" height={220}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
        >
          <XAxis
            type="number"
            tick={{ fontSize: 11, fill: '#9ca3af' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="faseNome"
            width={110}
            tick={{ fontSize: 12, fill: '#374151' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: '#f9fafb' }}
            contentStyle={{
              borderRadius: '8px',
              border: '1px solid #e5e7eb',
              fontSize: '12px',
            }}
            formatter={(value: number) => [`${value} processos`, '']}
          />
          <Bar dataKey="total" radius={[0, 4, 4, 0]}>
            {data?.map((entry, index) => (
              <Cell key={index} fill={entry.faseCor} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}