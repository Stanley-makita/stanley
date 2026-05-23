'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { ChevronLeft, ChevronRight, BarChart2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

function formatarMoeda(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

export function VisaoEmissoes() {
  const { usuario } = useAuth()
  const [data, setData] = useState(new Date())

  const mes = data.getMonth() + 1
  const ano = data.getFullYear()

  const nomeMes = data.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  const { data: emissoes } = useQuery({
    queryKey: ['processos', 'emissoes', usuario?.empresa_id, mes, ano],
    queryFn: async () => {
      const { data: result, error } = await supabase.rpc('emissoes_por_semana', {
        p_empresa_id: usuario!.empresa_id,
        p_mes: mes,
        p_ano: ano,
      })
      if (error) throw error
      return result
    },
    enabled: !!usuario,
  })

  function navegar(direcao: -1 | 1) {
    setData((d) => {
      const nova = new Date(d)
      nova.setMonth(nova.getMonth() + direcao)
      return nova
    })
  }

  const totalEmitidos = (emissoes ?? []).reduce((s: number, e: { emitidos: number }) => s + e.emitidos, 0)
  const totalProducao = (emissoes ?? []).reduce((s: number, e: { producao: number }) => s + e.producao, 0)

  return (
    <div className="space-y-6">
      {/* Cabeçalho com navegação de mês */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-[#E7E0C4] rounded-lg flex items-center justify-center">
              <BarChart2 className="h-4 w-4 text-[#253B29]" />
            </div>
            <div>
              <h3 className="font-semibold text-[#253B29]">
                Emissões — {nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1)}
              </h3>
              <p className="text-xs text-gray-400">Acompanhamento mensal de produção e metas</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navegar(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium text-[#253B29] min-w-[140px] text-center capitalize">
              {nomeMes}
            </span>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navegar(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Tabela de emissões por semana */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {['Emitidos','Produção (R$)','Emitidos até','% Valor','% Contratos'].map((h) => (
                  <th key={h} className="text-left text-xs text-gray-400 font-medium pb-2 pr-4">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(emissoes ?? []).map((semana: {
                emitidos: number
                producao: number
                emitidos_ate: string
                percentual_valor: number
                percentual_contratos: number
              }, i: number) => (
                <tr key={i} className="border-b border-gray-50 last:border-0">
                  <td className="py-2.5 pr-4 font-medium text-[#253B29]">{semana.emitidos}</td>
                  <td className="py-2.5 pr-4 text-blue-600 font-medium">
                    {formatarMoeda(semana.producao)}
                  </td>
                  <td className="py-2.5 pr-4 text-gray-500">
                    {new Date(semana.emitidos_ate).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="py-2.5 pr-4 text-gray-600">{semana.percentual_valor.toFixed(2)}%</td>
                  <td className="py-2.5 text-gray-600">{semana.percentual_contratos.toFixed(2)}%</td>
                </tr>
              ))}
              {/* Totais */}
              <tr className="bg-gray-50">
                <td className="py-2.5 pr-4 font-bold text-[#253B29]">{totalEmitidos}</td>
                <td className="py-2.5 pr-4 font-bold text-blue-600">{formatarMoeda(totalProducao)}</td>
                <td className="py-2.5 pr-4 text-gray-500 font-medium">Total</td>
                <td colSpan={2} />
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Metas do mês */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          { label: 'Meta Corte', sublabel: 'Meta mínima mensal', meta: 8000000, cor: '#f59e0b' },
          { label: 'Meta Plus', sublabel: 'Meta otimista mensal', meta: 9000000, cor: '#22c55e' },
        ].map((m) => {
          const percentual = Math.min((totalProducao / m.meta) * 100, 100)
          return (
            <div key={m.label} className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: m.cor + '20' }}>
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: m.cor }} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#253B29]">{m.label}</p>
                  <p className="text-xs text-gray-400">{m.sublabel}</p>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-gray-500">Valor</span>
                    <span className="font-medium text-[#253B29]">{percentual.toFixed(2)}%</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${percentual}%`, backgroundColor: m.cor }}
                    />
                  </div>
                  <div className="flex justify-between text-xs mt-1 text-gray-400">
                    <span>Realizado: {formatarMoeda(totalProducao)}</span>
                    <span>Meta: {formatarMoeda(m.meta)}</span>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}