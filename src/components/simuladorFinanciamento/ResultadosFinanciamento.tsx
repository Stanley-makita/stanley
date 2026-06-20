'use client'

import { cn } from '@/lib/utils'
import type { ResultadoBanco } from '@/lib/simuladorFinanciamento/tipos'

interface Props {
  resultados: ResultadoBanco[]
}

function fmtMoeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

function fmtPct(v: number, casas = 2) {
  return `${(v * 100).toFixed(casas)}%`
}

const NOME_ABREV: Record<string, string> = {
  caixa: 'Caixa', itau: 'Itaú', bradesco: 'Bradesco',
  santander: 'Santander', bb: 'BB', inter: 'Inter', daycoval: 'Daycoval',
}

function nomeAbrev(r: ResultadoBanco): string {
  return NOME_ABREV[r.bancoId] ?? r.bancoNome.split(' ')[0]
}

export function ResultadosFinanciamento({ resultados }: Props) {
  const elegiveis = resultados.filter((r) => r.elegivel)
  const inaplicaveis = resultados.filter((r) => !r.elegivel)
  const melhor = elegiveis[0]

  return (
    <div className="space-y-4">
      {/* Banner melhor opção */}
      {melhor && (
        <div
          className="rounded-xl p-4 text-white"
          style={{ backgroundColor: melhor.corBanco }}
        >
          <p className="text-xs font-medium opacity-80 mb-1">Melhor opção</p>
          <p className="text-lg font-bold">{melhor.bancoNome}</p>
          <div className="mt-2 grid grid-cols-3 gap-3 text-sm">
            <div>
              <p className="opacity-70 text-xs">1ª parcela</p>
              <p className="font-semibold">{fmtMoeda(melhor.primeiraParcela)}</p>
            </div>
            <div>
              <p className="opacity-70 text-xs">Taxa a.a.</p>
              <p className="font-semibold">{fmtPct(melhor.taxaAnual)}</p>
            </div>
            <div>
              <p className="opacity-70 text-xs">Prazo</p>
              <p className="font-semibold">{melhor.parcelas} meses</p>
            </div>
          </div>
        </div>
      )}

      {/* Tabela comparativa */}
      {elegiveis.length > 0 && (
        <div className="rounded-xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Banco</th>
                  <th className="px-3 py-2 text-left font-medium">Programa</th>
                  <th className="px-3 py-2 text-right font-medium">1ª Parcela</th>
                  <th className="px-3 py-2 text-right font-medium">Última</th>
                  <th className="px-3 py-2 text-right font-medium">Parcelas</th>
                  <th className="px-3 py-2 text-right font-medium">Taxa a.a.</th>
                  <th className="px-3 py-2 text-right font-medium">Total Juros</th>
                  <th className="px-3 py-2 text-right font-medium">Total Pago</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {elegiveis.map((r, i) => (
                  <tr
                    key={r.resultadoId}
                    className={cn('transition-colors', i === 0 ? 'bg-fonti-primary/5' : 'hover:bg-gray-50')}
                  >
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: r.corBanco }}
                        />
                        <span className="font-medium text-gray-800 whitespace-nowrap">
                          {nomeAbrev(r)}
                          {i === 0 && (
                            <span className="ml-1 text-[10px] text-fonti-primary font-bold">★</span>
                          )}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-gray-500">{r.programa}</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-gray-900">{fmtMoeda(r.primeiraParcela)}</td>
                    <td className="px-3 py-2.5 text-right text-gray-500">{fmtMoeda(r.ultimaParcela)}</td>
                    <td className="px-3 py-2.5 text-right text-gray-500">{r.parcelas}</td>
                    <td className="px-3 py-2.5 text-right text-gray-500">{fmtPct(r.taxaAnual)}</td>
                    <td className="px-3 py-2.5 text-right text-gray-500">{fmtMoeda(r.totalJuros)}</td>
                    <td className="px-3 py-2.5 text-right text-gray-500">{fmtMoeda(r.totalPago)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Cards individuais */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {elegiveis.map((r) => (
          <div
            key={r.resultadoId}
            className="rounded-xl border border-gray-100 bg-white overflow-hidden"
          >
            <div
              className="px-4 py-2.5 text-sm font-semibold text-white"
              style={{ backgroundColor: r.corBanco }}
            >
              {r.bancoNome} — {r.programa}
            </div>
            <div className="px-4 py-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <Metric label="1ª Parcela" value={fmtMoeda(r.primeiraParcela)} destaque />
              <Metric label="Última Parcela" value={fmtMoeda(r.ultimaParcela)} />
              <Metric label="Prazo" value={`${r.parcelas} meses`} />
              <Metric label="Amortização" value={r.tipoAmortizacao} />
              <Metric label="Taxa mensal" value={fmtPct(r.taxaMensal, 4)} />
              <Metric label="Taxa anual" value={fmtPct(r.taxaAnual)} />
              <Metric label="Total Juros" value={fmtMoeda(r.totalJuros)} />
              <Metric label="Total Seguros" value={fmtMoeda(r.totalSeguros)} />
              <Metric label="V. Financiado" value={fmtMoeda(r.valorFinanciado)} />
              <Metric label="Máx (30% renda)" value={fmtMoeda(r.maxFinanciavel30)} />
            </div>
          </div>
        ))}
      </div>

      {/* Inelegíveis */}
      {inaplicaveis.length > 0 && (
        <details className="rounded-xl border border-gray-100" open={elegiveis.length === 0}>
          <summary className="px-4 py-3 text-xs text-gray-400 cursor-pointer select-none">
            {inaplicaveis.length} banco(s) não elegível(is) — clique para ver motivos
          </summary>
          <div className="px-4 pb-3 space-y-1">
            {inaplicaveis.map((r) => (
              <div key={r.resultadoId} className="flex items-center gap-2 text-xs text-gray-500">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: r.corBanco }}
                />
                <span className="font-medium">{nomeAbrev(r)}:</span>
                <span>{r.motivoInelegivel}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

function Metric({ label, value, destaque }: { label: string; value: string; destaque?: boolean }) {
  return (
    <div>
      <p className="text-gray-400">{label}</p>
      <p className={cn('font-semibold mt-0.5', destaque ? 'text-fonti-primary' : 'text-gray-700')}>
        {value}
      </p>
    </div>
  )
}
