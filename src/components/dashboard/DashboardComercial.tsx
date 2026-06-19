'use client'

import { Users, TrendingUp, Target, CheckCircle2, Clock } from 'lucide-react'
import { KpiCard } from './KpiCard'
import { AtividadeRecente } from './AtividadeRecente'
import { useDashboardKpisComercial } from '@/hooks/dashboard/useDashboardPerfil'
import { DashboardSkeleton } from './DashboardSkeleton'
import { PageHeader } from '@/components/layout/PageHeader'

function saudacao(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

interface Props { nome?: string }

export function DashboardComercial({ nome }: Props) {
  const { data: kpis, isLoading } = useDashboardKpisComercial()

  if (isLoading) return <DashboardSkeleton />

  const taxaCerteza = kpis && kpis.meusProcessos > 0
    ? Math.round((kpis.processosCerteza / kpis.meusProcessos) * 100)
    : 0

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title={`${saudacao()}, ${nome?.split(' ')[0] ?? ''}`}
        description="Seu desempenho comercial - Fontinhas Assessoria"
      />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <KpiCard
          titulo="Meus processos"
          valor={String(kpis?.meusProcessos ?? 0)}
          variacao={0}
          icone={TrendingUp}
          destaque
          descricaoVariacao="ativos"
        />
        <KpiCard
          titulo="Certeza"
          valor={String(kpis?.processosCerteza ?? 0)}
          variacao={0}
          icone={CheckCircle2}
          descricaoVariacao="processos"
        />
        <KpiCard
          titulo="Incerteza"
          valor={String(kpis?.processosIncerteza ?? 0)}
          variacao={0}
          icone={Clock}
          descricaoVariacao="processos"
        />
        <KpiCard
          titulo="Meus leads"
          valor={String(kpis?.meusLeads ?? 0)}
          variacao={0}
          icone={Users}
          descricaoVariacao="total"
        />
        <KpiCard
          titulo="Leads este mês"
          valor={String(kpis?.meusLeadsMes ?? 0)}
          variacao={0}
          icone={Target}
          descricaoVariacao="novos"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-[#253B29] mb-1">Taxa de certeza</h2>
          <p className="text-3xl font-bold text-[#253B29]">{taxaCerteza}%</p>
          <p className="text-xs text-gray-400 mt-1">dos seus processos são de certeza de emissão</p>
          <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#253B29] rounded-full transition-all"
              style={{ width: `${taxaCerteza}%` }}
            />
          </div>
        </div>
        <div>
          <AtividadeRecente />
        </div>
      </div>
    </div>
  )
}
