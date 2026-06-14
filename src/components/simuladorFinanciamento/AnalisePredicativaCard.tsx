'use client'

import { cn } from '@/lib/utils'
import type { AnalisePredicativa } from '@/lib/simuladorFinanciamento/tipos'

const LABELS: Record<AnalisePredicativa['classificacao'], { label: string; cor: string }> = {
  alta:       { label: 'Alta probabilidade de aprovação',     cor: 'text-green-700 bg-green-50 border-green-200' },
  moderada:   { label: 'Probabilidade moderada de aprovação', cor: 'text-yellow-700 bg-yellow-50 border-yellow-200' },
  baixa:      { label: 'Baixa probabilidade de aprovação',    cor: 'text-orange-700 bg-orange-50 border-orange-200' },
  improvavel: { label: 'Improvável com parâmetros atuais',    cor: 'text-red-700 bg-red-50 border-red-200' },
}

const IMPACTO_ICON: Record<string, string> = {
  positivo: '✅',
  negativo: '⚠️',
  critico:  '❌',
}

interface Props {
  analise: AnalisePredicativa
}

function fmt(v: number, decimais = 0) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: decimais, maximumFractionDigits: decimais })
}

function fmtMoeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

export function AnalisePredicativaCard({ analise }: Props) {
  const { label, cor } = LABELS[analise.classificacao]
  const barCor =
    analise.score >= 70 ? 'bg-green-500'
    : analise.score >= 50 ? 'bg-yellow-500'
    : analise.score >= 30 ? 'bg-orange-500'
    : 'bg-red-500'

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-700">Análise Preditiva</p>
        <span className="text-2xl font-bold text-gray-900">{fmt(analise.score)}<span className="text-sm text-gray-400 font-normal">/100</span></span>
      </div>

      {/* Barra de score */}
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          className={cn('h-full rounded-full transition-all', barCor)}
          style={{ width: `${analise.score}%` }}
        />
      </div>

      {/* Classificação */}
      <div className={cn('rounded-lg border px-3 py-2 text-sm font-medium', cor)}>
        {label}
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-gray-50 px-3 py-2">
          <p className="text-xs text-gray-400">Comprometimento de renda</p>
          <p className={cn(
            'text-sm font-semibold mt-0.5',
            analise.comprometimentoRenda > 30 ? 'text-red-600' : 'text-[#253B29]'
          )}>
            {fmt(analise.comprometimentoRenda, 1)}%
          </p>
        </div>
        <div className="rounded-lg bg-gray-50 px-3 py-2">
          <p className="text-xs text-gray-400">Máx. financiável (30% renda)</p>
          <p className="text-sm font-semibold text-[#253B29] mt-0.5">{fmtMoeda(analise.maxFinanciavel)}</p>
        </div>
        <div className="rounded-lg bg-gray-50 px-3 py-2 col-span-2">
          <p className="text-xs text-gray-400">Renda mínima necessária</p>
          <p className="text-sm font-semibold text-[#253B29] mt-0.5">{fmtMoeda(analise.rendaMinimaNecessaria)}</p>
        </div>
      </div>

      {/* Fatores */}
      <div className="space-y-1.5">
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Fatores de análise</p>
        {analise.fatores.map((f, i) => (
          <div key={i} className="flex items-start gap-2 text-sm text-gray-700">
            <span className="shrink-0 text-base leading-tight">{IMPACTO_ICON[f.impacto]}</span>
            <span>{f.descricao}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
