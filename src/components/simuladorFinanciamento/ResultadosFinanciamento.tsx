'use client'

import { cn } from '@/lib/utils'
import { AlertTriangle, Download, Info, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ResultadoBanco } from '@/lib/simuladorFinanciamento/tipos'

interface Props {
  resultados: ResultadoBanco[]
  valorImovel?: number
  rendaMensal?: number
  rendaMinimaNecessaria?: number
  onSalvarBanco?: (banco: ResultadoBanco) => void
  onPDFBanco?: (banco: ResultadoBanco) => void
  salvandoId?: string
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

export function ResultadosFinanciamento({ resultados, valorImovel, rendaMensal, rendaMinimaNecessaria, onSalvarBanco, onPDFBanco, salvandoId }: Props) {
  const elegiveis    = resultados.filter((r) => r.elegivel)
  const inaplicaveis = resultados.filter((r) => !r.elegivel)
  const comAviso     = elegiveis.filter((r) => r.avisoRenda)
  const melhor       = elegiveis[0]

  return (
    <div className="space-y-4">

      {/* ── Banner: aviso de comprometimento de renda ── */}
      {comAviso.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-1.5">
          <div className="flex items-center gap-2 text-amber-700 font-semibold text-xs">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            Comprometimento de renda acima de 30%
          </div>
          <div className="space-y-0.5">
            {comAviso.map((r) => (
              <p key={r.resultadoId} className="text-xs text-amber-700">
                <span className="font-medium">{nomeAbrev(r)} ({r.programa}):</span>
                {' '}1ª parcela {fmtMoeda(r.primeiraParcela)}
                {r.maxFinanciavel30 > 0 && (
                  <> — máx. financiável com 30% da renda: <span className="font-semibold">{fmtMoeda(r.maxFinanciavel30)}</span></>
                )}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* ── Banner: melhor opção (só quando sem aviso) ── */}
      {melhor && !melhor.avisoRenda && (
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

      {/* ── Tabela comparativa ── */}
      {elegiveis.length > 0 && (
        <div className="rounded-xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Banco</th>
                  <th className="px-3 py-2 text-right font-medium">Vlr Imóvel</th>
                  <th className="px-3 py-2 text-right font-medium">Vlr Financiado</th>
                  <th className="px-3 py-2 text-left font-medium">Programa</th>
                  <th className="px-3 py-2 text-right font-medium">1ª Parcela</th>
                  <th className="px-3 py-2 text-right font-medium">Última</th>
                  <th className="px-3 py-2 text-right font-medium">Parcelas</th>
                  <th className="px-3 py-2 text-right font-medium">Taxa a.a.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {elegiveis.map((r, i) => (
                  <tr
                    key={r.resultadoId}
                    className={cn(
                      'transition-colors',
                      r.avisoRenda
                        ? 'bg-amber-50/60 hover:bg-amber-50'
                        : i === 0 ? 'bg-fonti-primary/5' : 'hover:bg-gray-50',
                    )}
                  >
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: r.corBanco }} />
                        <span className="font-medium text-gray-800 whitespace-nowrap">
                          {nomeAbrev(r)}
                          {i === 0 && !r.avisoRenda && <span className="ml-1 text-[10px] text-fonti-primary font-bold">★</span>}
                          {r.avisoRenda && <span className="ml-1 text-[10px] text-amber-600 font-bold">⚠</span>}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-500">{valorImovel ? fmtMoeda(valorImovel) : '—'}</td>
                    <td className="px-3 py-2.5 text-right text-gray-500">{fmtMoeda(r.valorFinanciado)}</td>
                    <td className="px-3 py-2.5 text-gray-500">{r.programa}</td>
                    <td className={cn('px-3 py-2.5 text-right font-semibold', r.avisoRenda ? 'text-amber-700' : 'text-gray-900')}>
                      {fmtMoeda(r.primeiraParcela)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-500">{fmtMoeda(r.ultimaParcela)}</td>
                    <td className="px-3 py-2.5 text-right text-gray-500">{r.parcelas}</td>
                    <td className="px-3 py-2.5 text-right text-gray-500">{fmtPct(r.taxaAnual)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Cards individuais ── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {elegiveis.map((r) => (
          <div
            key={r.resultadoId}
            className={cn(
              'rounded-xl border overflow-hidden bg-white',
              r.avisoRenda ? 'border-amber-200' : 'border-gray-100',
            )}
          >
            {/* Header colorido */}
            <div className="px-4 py-2.5 text-sm font-semibold text-white" style={{ backgroundColor: r.corBanco }}>
              {r.bancoNome} — {r.programa}
            </div>

            {/* Métricas */}
            <div className="px-4 py-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <Metric label="1ª Parcela"     value={fmtMoeda(r.primeiraParcela)} destaque={!r.avisoRenda} aviso={r.avisoRenda} />
              <Metric label="Última Parcela" value={fmtMoeda(r.ultimaParcela)} />
              <Metric label="Prazo"          value={`${r.parcelas} meses`} />
              <Metric label="Amortização"    value={r.tipoAmortizacao} />
              <Metric label="Taxa mensal"    value={fmtPct(r.taxaMensal, 4)} />
              <Metric label="Taxa anual"     value={fmtPct(r.taxaAnual)} />
              <Metric label="Total Juros"    value={fmtMoeda(r.totalJuros)} />
              <Metric label="Total Seguros"  value={fmtMoeda(r.totalSeguros)} />
              <Metric label="V. Financiado"  value={fmtMoeda(r.valorFinanciado)} />
              <Metric label="Máx (30% renda)" value={fmtMoeda(r.maxFinanciavel30)} />
            </div>

            {/* Aviso de comprometimento */}
            {r.avisoRenda && (
              <div className="mx-4 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700 space-y-0.5">
                <div className="flex items-center gap-1.5 font-semibold">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  Comprometimento de renda acima de 30%
                </div>
                {r.maxFinanciavel30 > 0 && (
                  <p>Máx. financiável com 30% da renda: <span className="font-semibold">{fmtMoeda(r.maxFinanciavel30)}</span></p>
                )}
              </div>
            )}

            {/* Observação por modalidade */}
            {r.observacao && (
              <div className="mx-4 mb-3 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-800">
                <div className="flex items-start gap-1.5">
                  <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{r.observacao}</span>
                </div>
              </div>
            )}

            {/* Botões por banco */}
            {(onSalvarBanco || onPDFBanco) && (
              <div className="flex gap-2 px-4 py-3">
                {onSalvarBanco && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1 border-gray-200 text-gray-600 hover:bg-gray-50"
                    onClick={() => onSalvarBanco(r)}
                    disabled={salvandoId === r.resultadoId}
                  >
                    <Save className="w-3 h-3" />
                    {salvandoId === r.resultadoId ? 'Salvando...' : 'Salvar'}
                  </Button>
                )}
                {onPDFBanco && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1 border-fonti-accent text-fonti-primary hover:bg-fonti-accent-hover"
                    onClick={() => onPDFBanco(r)}
                  >
                    <Download className="w-3 h-3" />
                    PDF
                  </Button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Banner orientativo quando nenhum banco elegível ── */}
      {elegiveis.length === 0 && rendaMensal && (
        <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 space-y-2">
          <div className="flex items-center gap-2 text-orange-800 font-semibold text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            Nenhum banco elegível automaticamente com os dados informados
          </div>
          <p className="text-sm text-orange-800">
            Com a renda informada de <strong>{fmtMoeda(rendaMensal)}</strong>,
            a parcela máxima estimada é de{' '}
            <strong>{fmtMoeda(rendaMensal * 0.30)}</strong>,
            considerando 30% da renda — o limite pode variar conforme a modalidade.
            {rendaMinimaNecessaria != null && rendaMinimaNecessaria > 0 && (
              <> A renda mínima necessária estimada para este financiamento é de{' '}
              <strong>{fmtMoeda(rendaMinimaNecessaria)}</strong>.</>
            )}
          </p>
          <p className="text-sm text-orange-700">
            Você pode ajustar o tamanho do sonho aumentando a entrada ou buscando
            um imóvel de menor valor. Outra possibilidade é{' '}
            <strong>compor renda com outra pessoa</strong>. Fale com um de nossos
            comerciais para avaliarmos alternativas para atingir esse objetivo.
          </p>
        </div>
      )}

      {/* ── Incompatíveis (LTV, idade, teto) ── */}
      {inaplicaveis.length > 0 && (
        <details className="rounded-xl border border-gray-100" open={elegiveis.length === 0}>
          <summary className="px-4 py-3 text-xs text-gray-400 cursor-pointer select-none">
            {inaplicaveis.length} banco(s) incompatível(is) — clique para ver motivos
          </summary>
          <div className="px-4 pb-3 space-y-1">
            {inaplicaveis.map((r) => (
              <div key={r.resultadoId} className="flex items-center gap-2 text-xs text-gray-500">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: r.corBanco }} />
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

function Metric({ label, value, destaque, aviso }: { label: string; value: string; destaque?: boolean; aviso?: boolean }) {
  return (
    <div>
      <p className="text-gray-400">{label}</p>
      <p className={cn('font-semibold mt-0.5', destaque ? 'text-fonti-primary' : aviso ? 'text-amber-700' : 'text-gray-700')}>
        {value}
      </p>
    </div>
  )
}
