'use client'

import { AlertCircle, Loader2, CheckCircle2, ListTodo } from 'lucide-react'
import { KpiCard } from './KpiCard'
import { DashboardSkeleton } from './DashboardSkeleton'
import { useDashboardKpisOperacional } from '@/hooks/dashboard/useDashboardPerfil'
import { PageHeader } from '@/components/layout/PageHeader'

function saudacao(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

interface Props { nome?: string }

export function DashboardOperacional({ nome }: Props) {
  const { data: kpis, isLoading } = useDashboardKpisOperacional()

  if (isLoading) return <DashboardSkeleton />

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title={`${saudacao()}, ${nome?.split(' ')[0] ?? ''}`}
        description="Suas solicitações operacionais - Fontinhas Assessoria"
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          titulo="Pendentes"
          valor={String(kpis?.solPendentes ?? 0)}
          variacao={0}
          icone={AlertCircle}
          destaque
          descricaoVariacao="aguardando"
        />
        <KpiCard
          titulo="Em andamento"
          valor={String(kpis?.solEmAndamento ?? 0)}
          variacao={0}
          icone={Loader2}
          descricaoVariacao="em progresso"
        />
        <KpiCard
          titulo="Concluídas hoje"
          valor={String(kpis?.solConcluidasHoje ?? 0)}
          variacao={0}
          icone={CheckCircle2}
          descricaoVariacao="finalizadas"
        />
        <KpiCard
          titulo="Total ativo"
          valor={String(kpis?.solTotal ?? 0)}
          variacao={0}
          icone={ListTodo}
          descricaoVariacao="todas"
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <p className="text-sm text-gray-500">
          Acesse <strong className="text-fonti-primary">Operacional</strong> no menu para ver e responder suas solicitações em detalhe.
        </p>
      </div>
    </div>
  )
}
