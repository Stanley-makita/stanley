'use client'

import { useRelatorioEquipe } from '@/hooks/financeiro/useRelatorioEquipe'
import { Trophy, TrendingUp } from 'lucide-react'

function fmtMoeda(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)
}

interface Props { mes: number; ano: number }

export function VisaoRelatorioEquipe({ mes, ano }: Props) {
  const { data: relatorio = [], isLoading } = useRelatorioEquipe(mes, ano)

  if (isLoading) {
    return <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-gray-100 animate-pulse rounded-xl" />)}</div>
  }

  if (relatorio.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-8">Nenhum dado de equipe no período.</p>
  }

  const maxValor = Math.max(...relatorio.map((r) => r.valor_emitido), 1)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Trophy className="h-4 w-4 text-[#C2AA6A]" />
        <span className="text-sm font-semibold text-[#253B29]">Ranking de Produção</span>
      </div>

      {relatorio.map((r, idx) => {
        const percentual = (r.valor_emitido / maxValor) * 100

        return (
          <div key={r.comercial_id} className="bg-white border border-gray-100 rounded-xl p-4 hover:border-gray-200 transition-colors">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                {/* Posição */}
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                  idx === 0 ? 'bg-[#C2AA6A] text-white'
                  : idx === 1 ? 'bg-gray-300 text-gray-700'
                  : idx === 2 ? 'bg-amber-700 text-white'
                  : 'bg-gray-100 text-gray-500'
                }`}>
                  {idx + 1}
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#253B29]">{r.comercial_nome}</p>
                  <p className="text-xs text-gray-400">{r.num_contratos} contrato{r.num_contratos !== 1 ? 's' : ''}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-[#253B29]">{fmtMoeda(r.valor_emitido)}</p>
                <p className="text-xs text-gray-400">emitido</p>
              </div>
            </div>

            {/* Barra de progresso relativa */}
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-3">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${percentual}%`, backgroundColor: idx === 0 ? '#C2AA6A' : '#253B29' }}
              />
            </div>

            {/* Linha de comissões */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-amber-50 rounded-lg p-2">
                <p className="text-xs text-gray-400">Comissão gerada</p>
                <p className="text-sm font-medium text-amber-700">{fmtMoeda(r.comissao_gerada)}</p>
              </div>
              <div className="bg-green-50 rounded-lg p-2">
                <p className="text-xs text-gray-400">Comissão recebida</p>
                <p className="text-sm font-medium text-green-700">{fmtMoeda(r.comissao_recebida)}</p>
              </div>
            </div>
          </div>
        )
      })}

      {/* Totais */}
      <div className="bg-[#253B29] rounded-xl p-4 text-white">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="h-4 w-4 text-[#C2AA6A]" />
          <span className="text-sm font-semibold">Total da Equipe</span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className="text-xs text-white/60">Contratos</p>
            <p className="text-lg font-bold">{relatorio.reduce((s, r) => s + r.num_contratos, 0)}</p>
          </div>
          <div>
            <p className="text-xs text-white/60">Valor Emitido</p>
            <p className="text-lg font-bold text-[#C2AA6A]">{fmtMoeda(relatorio.reduce((s, r) => s + r.valor_emitido, 0))}</p>
          </div>
          <div>
            <p className="text-xs text-white/60">Comissão Gerada</p>
            <p className="text-lg font-bold text-[#C2AA6A]">{fmtMoeda(relatorio.reduce((s, r) => s + r.comissao_gerada, 0))}</p>
          </div>
        </div>
      </div>
    </div>
  )
}