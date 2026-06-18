'use client'

import { Users, PalmtreeIcon, UserX, UserCheck, Clock, Cake, Building2, Calendar } from 'lucide-react'
import { useDashboardRh } from '@/hooks/rh/useDashboardRh'
import { cn } from '@/lib/utils'

interface KpiCardProps {
  icon: React.ReactNode
  label: string
  valor: number | string
  sub: string
  cor: string
  bgIcon: string
}

function KpiCard({ icon, label, valor, sub, cor, bgIcon }: KpiCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 flex items-start gap-4">
      <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center shrink-0', bgIcon)}>
        {icon}
      </div>
      <div>
        <p className="text-xs text-gray-400 font-medium">{label}</p>
        <p className={cn('text-2xl font-bold mt-0.5', cor)}>{valor}</p>
        <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
      </div>
    </div>
  )
}

export function DashboardRh() {
  const { data: d, isLoading } = useDashboardRh()

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-100 p-5 h-28 animate-pulse" />
        ))}
      </div>
    )
  }

  const kpis: KpiCardProps[] = [
    {
      icon: <Users className="h-5 w-5 text-blue-600" />,
      label: 'Total de Funcionários',
      valor: d?.totalFuncionarios ?? 0,
      sub: 'Ativos no sistema',
      cor: 'text-blue-700',
      bgIcon: 'bg-blue-50',
    },
    {
      icon: <PalmtreeIcon className="h-5 w-5 text-teal-600" />,
      label: 'Em Férias',
      valor: d?.emFerias ?? 0,
      sub: 'Afastados por férias',
      cor: 'text-teal-700',
      bgIcon: 'bg-teal-50',
    },
    {
      icon: <UserX className="h-5 w-5 text-red-500" />,
      label: 'Afastados',
      valor: d?.afastados ?? 0,
      sub: 'Licenças e atestados',
      cor: 'text-red-600',
      bgIcon: 'bg-red-50',
    },
    {
      icon: <UserCheck className="h-5 w-5 text-green-600" />,
      label: 'Presentes Hoje',
      valor: d?.presentesHoje ?? 0,
      sub: 'Registraram ponto',
      cor: 'text-green-700',
      bgIcon: 'bg-green-50',
    },
    {
      icon: <Clock className="h-5 w-5 text-orange-500" />,
      label: 'Atrasados',
      valor: d?.atrasados ?? 0,
      sub: 'Entrada após 08:15',
      cor: d?.atrasados ? 'text-orange-600' : 'text-gray-700',
      bgIcon: 'bg-orange-50',
    },
    {
      icon: <Cake className="h-5 w-5 text-pink-500" />,
      label: 'Aniversariantes',
      valor: d?.aniversariantesMes ?? 0,
      sub: 'Neste mês',
      cor: 'text-pink-600',
      bgIcon: 'bg-pink-50',
    },
    {
      icon: <Building2 className="h-5 w-5 text-amber-600" />,
      label: 'Aniversário Empresa',
      valor: d?.aniversarioEmpresaMes ?? 0,
      sub: 'Admissão no mês',
      cor: 'text-amber-700',
      bgIcon: 'bg-amber-50',
    },
    {
      icon: <Calendar className="h-5 w-5 text-purple-500" />,
      label: 'Próximas Férias',
      valor: d?.proximasFerias ?? 0,
      sub: 'Agendadas',
      cor: 'text-purple-600',
      bgIcon: 'bg-purple-50',
    },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {kpis.map((k) => (
        <KpiCard key={k.label} {...k} />
      ))}
    </div>
  )
}
