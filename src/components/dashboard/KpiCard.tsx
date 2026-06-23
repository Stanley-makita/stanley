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
      className={`rounded-xl border p-5 flex flex-col gap-3 shadow-[var(--shadow-card)] ${
        destaque
          ? 'bg-fonti-primary text-white border-fonti-primary'
          : 'bg-white border-gray-100'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className={`text-[11px] font-semibold uppercase tracking-wide ${destaque ? 'text-fonti-accent' : 'text-gray-400'}`}>
          {titulo}
        </span>
        <div
          className={`w-9 h-9 rounded-lg flex items-center justify-center ${
            destaque ? 'bg-fonti-primary-hover' : 'bg-fonti-accent-hover'
          }`}
        >
          <Icone className={`h-4 w-4 ${destaque ? 'text-fonti-accent' : 'text-fonti-primary'}`} />
        </div>
      </div>

      <div className={`text-3xl font-bold tracking-tight ${destaque ? 'text-white' : 'text-fonti-primary'}`}>
        {valor}
      </div>

      <div className="flex items-center gap-1.5">
        {variacaoNeutra ? (
          <Minus className="h-3.5 w-3.5 text-gray-400" />
        ) : variacaoPositiva ? (
          <TrendingUp className="h-3.5 w-3.5 text-green-500" />
        ) : (
          <TrendingDown className="h-3.5 w-3.5 text-red-500" />
        )}
        <span
          className={`text-xs font-medium ${
            variacaoNeutra
              ? 'text-gray-400'
              : variacaoPositiva
              ? 'text-green-600'
              : 'text-red-500'
          }`}
        >
          {variacaoNeutra ? 'Sem variação' : `${variacao > 0 ? '+' : ''}${variacao}%`}
        </span>
        <span className={`text-xs ${destaque ? 'text-gray-400' : 'text-gray-400'}`}>
          {descricaoVariacao}
        </span>
      </div>
    </div>
  )
}