'use client'

import { TrendingUp, Users, Target, Banknote, UserCheck } from 'lucide-react'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { ProcessosPorFaseChart } from '@/components/dashboard/ProcessosPorFaseChart'
import { AtividadeRecente } from '@/components/dashboard/AtividadeRecente'
import { MetasEquipe } from '@/components/dashboard/MetasEquipe'
import { DashboardSkeleton } from '@/components/dashboard/DashboardSkeleton'
import { DashboardComercial } from '@/components/dashboard/DashboardComercial'
import { DashboardOperacional } from '@/components/dashboard/DashboardOperacional'
import { DashboardJuridico } from '@/components/dashboard/DashboardJuridico'
import { PageHeader } from '@/components/layout/PageHeader'
import { useDashboardKpis, useMembrosAtivos } from '@/hooks/dashboard/useDashboard'
import { useAuth } from '@/hooks/auth/useAuth'

function formatarMoeda(centavos: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(centavos / 100)
}

function saudacao(): string {
  const hora = new Date().getHours()
  if (hora < 12) return 'Bom dia'
  if (hora < 18) return 'Boa tarde'
  return 'Boa noite'
}

function DashboardGestor() {
  const { usuario } = useAuth()
  const { data: kpis, isLoading: loadingKpis } = useDashboardKpis()
  const { data: membros } = useMembrosAtivos()

  if (loadingKpis) return <DashboardSkeleton />

  const totalMembros = membros?.length ?? 0

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title={`${saudacao()}, ${usuario?.nome?.split(' ')[0] ?? ''}`}
        description="Aqui está o resumo de hoje - Fontinhas Assessoria"
      />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <KpiCard
          titulo="Processos ativos"
          valor={String(kpis?.processosAtivos ?? 0)}
          variacao={kpis?.processosAtivosVariacao ?? 0}
          icone={TrendingUp}
          destaque
        />
        <KpiCard
          titulo="Leads este mês"
          valor={String(kpis?.leadsMes ?? 0)}
          variacao={kpis?.leadsMesVariacao ?? 0}
          icone={Users}
        />
        <KpiCard
          titulo="Taxa de conversão"
          valor={`${kpis?.taxaConversao ?? 0}%`}
          variacao={kpis?.taxaConversaoVariacao ?? 0}
          icone={Target}
          descricaoVariacao="vs mês anterior"
        />
        <KpiCard
          titulo="Valor em carteira"
          valor={formatarMoeda(kpis?.valorCarteira ?? 0)}
          variacao={kpis?.valoreCarteiraVariacao ?? 0}
          icone={Banknote}
        />
        <KpiCard
          titulo="Membros ativos"
          valor={String(totalMembros)}
          variacao={0}
          icone={UserCheck}
          descricaoVariacao="na equipe"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <ProcessosPorFaseChart />
        </div>
        <div>
          <AtividadeRecente />
        </div>
      </div>

      <MetasEquipe />
    </div>
  )
}

export default function DashboardPage() {
  const { usuario } = useAuth()
  const perfil = usuario?.perfil

  if (!perfil) return <DashboardSkeleton />

  if (perfil === 'operacional') return <DashboardOperacional nome={usuario?.nome} />
  if (perfil === 'juridico') return <DashboardJuridico nome={usuario?.nome} />
  if (perfil === 'comercial' || perfil === 'analista' || perfil === 'consultor' || perfil === 'apoio') {
    return <DashboardComercial nome={usuario?.nome} />
  }

  // admin | gerente | gestor | cliente
  return <DashboardGestor />
}
