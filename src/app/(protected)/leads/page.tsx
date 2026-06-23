'use client'

import { useState, useCallback, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { KanbanBoard } from '@/components/leads/KanbanBoard'
import { LeadModal } from '@/components/leads/LeadModal'
import { LeadListView } from '@/components/leads/LeadListView'
import { LeadDetalheModal } from '@/components/leads/LeadDetalheModal'
import { DashboardLeads } from '@/components/leads/DashboardLeads'
import { usePermissao } from '@/hooks/auth/usePermissao'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/layout/PageHeader'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { UserPlus, Columns, List, Search, LayoutDashboard } from 'lucide-react'

type Visao = 'dashboard' | 'kanban' | 'lista'
type FiltroLista = 'inativos' | undefined

const VISOES_LEADS = [
  { value: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, title: 'Dashboard operacional' },
  { value: 'kanban', label: 'Kanban', icon: Columns, title: 'Visão Kanban' },
  { value: 'lista', label: 'Lista', icon: List, title: 'Visão Lista' },
] satisfies Array<{ value: Visao; label: string; icon: typeof LayoutDashboard; title: string }>

function LeadsContent() {
  const { pode } = usePermissao()
  const searchParams = useSearchParams()
  const router = useRouter()

  const [visao, setVisao] = useState<Visao>('dashboard')
  const [filtroLista, setFiltroLista] = useState<FiltroLista>(undefined)
  const [modalAberto, setModalAberto] = useState(false)
  const [faseIdNovo, setFaseIdNovo] = useState<string | undefined>()
  const [busca, setBusca] = useState('')
  const [faseIdFiltro, setFaseIdFiltro] = useState<string | undefined>()
  const [leadDetalheId, setLeadDetalheId] = useState<string | null>(null)

  useEffect(() => {
    const openId = searchParams.get('open')
    if (openId && openId !== leadDetalheId) {
      setLeadDetalheId(openId)
    }
  }, [searchParams])

  function fecharDetalhe() {
    setLeadDetalheId(null)
    const params = new URLSearchParams(searchParams.toString())
    params.delete('open')
    const novaUrl = params.toString() ? `?${params.toString()}` : window.location.pathname
    router.replace(novaUrl, { scroll: false })
  }

  const abrirModal = useCallback((faseId?: string) => {
    setFaseIdNovo(faseId)
    setModalAberto(true)
  }, [])

  const abrirDetalhe = useCallback((id: string) => {
    setLeadDetalheId(id)
  }, [])

  function irParaVisao(v: Visao) {
    setVisao(v)
    setFiltroLista(undefined)
  }

  const irParaLista = useCallback((filtro?: FiltroLista) => {
    setFiltroLista(filtro)
    setVisao('lista')
  }, [])

  const irParaKanban = useCallback(() => {
    setFiltroLista(undefined)
    setVisao('kanban')
  }, [])

  return (
    <div className="space-y-4 p-4 md:p-6">
      <PageHeader
        title="Comercial"
        description="Gerencie sua captação em todas as fases"
        actions={(
          <>
          {visao === 'lista' && (
            <div className="relative min-w-0 flex-1 sm:flex-none">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
              <Input
                placeholder="Buscar captação..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="h-9 w-full pl-9 text-sm sm:w-52"
              />
            </div>
          )}

          <SegmentedControl
            value={visao}
            items={VISOES_LEADS}
            onChange={irParaVisao}
            iconOnly
            className="max-w-full"
          />

          {pode('leads.criar') && (
            <Button
              className="h-9 w-full gap-2 sm:w-auto"
              onClick={() => abrirModal()}
            >
              <UserPlus className="h-4 w-4" />
              Nova Captação
            </Button>
          )}
          </>
        )}
      />

      {/* Conteúdo */}
      {visao === 'dashboard' && (
        <DashboardLeads
          onAbrirLead={abrirDetalhe}
          onIrParaLista={irParaLista}
          onIrParaKanban={irParaKanban}
        />
      )}
      {visao === 'kanban' && (
        <div className="-mx-4 overflow-x-auto px-4 pb-4 md:mx-0 md:px-0">
          <KanbanBoard onCriarLead={abrirModal} onAbrirLead={abrirDetalhe} />
        </div>
      )}
      {visao === 'lista' && (
        <LeadListView
          busca={busca}
          faseId={faseIdFiltro}
          onFaseChange={setFaseIdFiltro}
          onAbrirLead={abrirDetalhe}
          filtroEspecial={filtroLista}
        />
      )}

      <LeadModal
        aberto={modalAberto}
        onFechar={() => setModalAberto(false)}
        faseIdInicial={faseIdNovo}
      />

      <LeadDetalheModal
        leadId={leadDetalheId}
        onFechar={fecharDetalhe}
      />
    </div>
  )
}

export default function LeadsPage() {
  return (
    <Suspense>
      <LeadsContent />
    </Suspense>
  )
}
