'use client'

import { formatarMoeda } from '@/lib/utils'

export interface ResumoPeriodoDRE {
  label: string
  dataInicio: string
  dataFim: string
  receitaPrevista: number
  receitaRealizada: number
  despesaPrevista: number
  despesaRealizada: number
}

function fmtPeriodoBR(inicio: string, fim: string): string {
  const f = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR')
  return `${f(inicio)} – ${f(fim)}`
}

interface Props {
  resumos: ResumoPeriodoDRE[]
  isLoading?: boolean
  legenda?: React.ReactNode
}

// Grid de cards "Mês/Trimestre/Semestre/Ano vigente", cada um com uma
// mini-DRE (Receita/Despesa/Resultado) em Previsto x Realizado —
// reaproveitado pela Prévia Financeira de Consórcio e Financiamento.
export function DREPeriodoCards({ resumos, isLoading, legenda }: Props) {
  if (isLoading) {
    return <p className="text-sm text-gray-400 py-8 text-center">Carregando prévia financeira...</p>
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        {legenda ?? (
          <>
            <strong>Previsto</strong> soma pelo vencimento/emissão (regime de competência), <strong>Realizado</strong>{' '}
            soma pelo que já foi efetivamente recebido/pago (regime de caixa).
          </>
        )}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {resumos.map((r) => {
          const resultadoPrevisto = r.receitaPrevista - r.despesaPrevista
          const resultadoRealizado = r.receitaRealizada - r.despesaRealizada
          return (
            <div key={r.label} className="rounded-lg border bg-white p-4 space-y-3">
              <div>
                <p className="text-sm font-semibold text-fonti-primary">{r.label}</p>
                <p className="text-[11px] text-gray-400">{fmtPeriodoBR(r.dataInicio, r.dataFim)}</p>
              </div>

              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-400">
                    <th className="text-left font-normal pb-1"></th>
                    <th className="text-right font-normal pb-1">Previsto</th>
                    <th className="text-right font-normal pb-1">Realizado</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-gray-100">
                    <td className="py-1.5 text-gray-600">Receita</td>
                    <td className="py-1.5 text-right font-mono text-gray-700">{formatarMoeda(r.receitaPrevista)}</td>
                    <td className="py-1.5 text-right font-mono text-green-700">{formatarMoeda(r.receitaRealizada)}</td>
                  </tr>
                  <tr className="border-t border-gray-100">
                    <td className="py-1.5 text-gray-600">Despesa</td>
                    <td className="py-1.5 text-right font-mono text-gray-700">{formatarMoeda(r.despesaPrevista)}</td>
                    <td className="py-1.5 text-right font-mono text-red-600">{formatarMoeda(r.despesaRealizada)}</td>
                  </tr>
                  <tr className="border-t border-gray-200">
                    <td className="py-1.5 font-medium text-gray-800">Resultado</td>
                    <td className={`py-1.5 text-right font-mono font-semibold ${resultadoPrevisto < 0 ? 'text-red-600' : 'text-fonti-primary'}`}>
                      {formatarMoeda(resultadoPrevisto)}
                    </td>
                    <td className={`py-1.5 text-right font-mono font-semibold ${resultadoRealizado < 0 ? 'text-red-600' : 'text-fonti-primary'}`}>
                      {formatarMoeda(resultadoRealizado)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )
        })}
      </div>
    </div>
  )
}
