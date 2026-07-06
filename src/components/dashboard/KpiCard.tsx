import { type LucideIcon } from 'lucide-react'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface KpiCardProps {
  titulo: string
  valor: string
  variacao: number        // percentual, positivo = crescimento
  icone: LucideIcon
  descricaoVariacao?: string
  destaque?: boolean      // true = fundo brand-dark
}

export function KpiCard({
  titulo,
  valor,
  variacao,
  icone: Icone,
  descricaoVariacao = 'vs mês anterior',
  destaque = false,
}: KpiCardProps) {
  const variacaoPositiva = variacao > 0
  const variacaoNeutra = variacao === 0

  return (
    <div
      className={`rounded-xl border p-4 sm:p-5 flex min-w-0 flex-col gap-3 overflow-hidden shadow-[var(--shadow-card)] ${
        destaque
          ? 'bg-fonti-primary text-white border-fonti-primary'
          : 'bg-white border-gray-100'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`min-w-0 truncate text-[11px] font-semibold uppercase tracking-wide ${destaque ? 'text-fonti-accent' : 'text-gray-400'}`}>
          {titulo}
        </span>
        <div
          className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex shrink-0 items-center justify-center ${
            destaque ? 'bg-fonti-primary-hover' : 'bg-fonti-accent-hover'
          }`}
        >
          <Icone className={`h-4 w-4 ${destaque ? 'text-fonti-accent' : 'text-fonti-primary'}`} />
        </div>
      </div>

      <div
        className={`min-w-0 text-[clamp(1.375rem,6vw,1.875rem)] sm:text-3xl font-bold leading-tight tracking-tight tabular-nums ${destaque ? 'text-white' : 'text-fonti-primary'}`}
        style={{ overflowWrap: 'anywhere' }}
      >
        {valor}
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
        {variacaoNeutra ? (
          <Minus className="h-3.5 w-3.5 shrink-0 text-gray-400" />
        ) : variacaoPositiva ? (
          <TrendingUp className="h-3.5 w-3.5 shrink-0 text-green-500" />
        ) : (
          <TrendingDown className="h-3.5 w-3.5 shrink-0 text-red-500" />
        )}
        <span
          className={`shrink-0 text-xs font-medium ${
            variacaoNeutra
              ? 'text-gray-400'
              : variacaoPositiva
              ? 'text-green-600'
              : 'text-red-500'
          }`}
        >
          {variacaoNeutra ? 'Sem variação' : `${variacao > 0 ? '+' : ''}${variacao}%`}
        </span>
        <span className={`min-w-0 text-xs ${destaque ? 'text-gray-400' : 'text-gray-400'}`}>
          {descricaoVariacao}
        </span>
      </div>
    </div>
  )
}