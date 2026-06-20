'use client'

import { FileText, MapPin, Clock, CheckCircle2 } from 'lucide-react'
import { KpiCard } from './KpiCard'
import { DashboardSkeleton } from './DashboardSkeleton'
import { useDashboardKpisJuridico } from '@/hooks/dashboard/useDashboardPerfil'
import { PageHeader } from '@/components/layout/PageHeader'

function saudacao(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

interface Props { nome?: string }

export function DashboardJuridico({ nome }: Props) {
  const { data: kpis, isLoading } = useDashboardKpisJuridico()

  if (isLoading) return <DashboardSkeleton />

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title={`${saudacao()}, ${nome?.split(' ')[0] ?? ''}`}
        description="Processos jurídicos - Fontinhas Assessoria"
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          titulo="Contratos ativos"
          valor={String(kpis?.contratosAtivos ?? 0)}
          variacao={0}
          icone={FileText}
          destaque
          descricaoVariacao="em andamento"
        />
        <KpiCard
          titulo="Registros ativos"
          valor={String(kpis?.registrosAtivos ?? 0)}
          variacao={0}
          icone={MapPin}
          descricaoVariacao="em andamento"
        />
        <KpiCard
          titulo="Em análise"
          valor={String(kpis?.emAnalise ?? 0)}
          variacao={0}
          icone={Clock}
          descricaoVariacao="aguardando"
        />
        <KpiCard
          titulo="Aprovados"
          valor={String(kpis?.aprovados ?? 0)}
          variacao={0}
          icone={CheckCircle2}
          descricaoVariacao="concluídos"
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <p className="text-sm text-gray-500">
          Acesse <strong className="text-fonti-primary">Negócios → Contratos</strong> e <strong className="text-fonti-primary">Registros</strong> no menu para ver os detalhes.
        </p>
      </div>
    </div>
  )
}
