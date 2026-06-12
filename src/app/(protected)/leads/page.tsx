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
import { UserPlus, Columns, List, Search, LayoutDashboard } from 'lucide-react'
import { cn } from '@/lib/utils'

type Visao = 'dashboard' | 'kanban' | 'lista'

function LeadsContent() {
  const { pode } = usePermissao()
  const searchParams = useSearchParams()
  const router = useRouter()

  const [visao, setVisao] = useState<Visao>('dashboard')
  const [modalAberto, setModalAberto] = useState(false)
  const [faseIdNovo, setFaseIdNovo] = useState<string | undefined>()
  const [busca, setBusca] = useState('')
  const [faseIdFiltro, setFaseIdFiltro] = useState<string | undefined>()
  const [leadDetalheId, setLeadDetalheId] = useState<string | null>(null)

  // Abrir modal de detalhe via ?open=<leadId> (busca global)
  useEffect(() => {
    const openId = searchParams.get('open')
    if (openId && openId !== leadDetalheId) {
      setLeadDetalheId(openId)
    }
  }, [searchParams])

  function fecharDetalhe() {
    setLeadDetalheId(null)
    // Limpa o param da URL sem navegar
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

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#253B29]">Leads</h1>
          <p className="text-sm text-gray-500">Gerencie seus leads em todas as fases</p>
        </div>

        <div className="flex items-center gap-2">
          {/* Busca — só na visão lista */}
          {visao === 'lista' && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
              <Input
                placeholder="Buscar lead..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="pl-9 h-9 w-52 text-sm"
              />
            </div>
          )}

          {/* Toggle dashboard / kanban / lista */}
          <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
            <button
              onClick={() => setVisao('dashboard')}
              title="Dashboard operacional"
              className={cn(
                'p-2 transition-colors',
                visao === 'dashboard'
                  ? 'bg-[#253B29] text-white'
                  : 'bg-white text-gray-500 hover:bg-gray-50'
              )}
            >
              <LayoutDashboard className="h-4 w-4" />
            </button>
            <button
              onClick={() => setVisao('kanban')}
              title="Visão Kanban"
              className={cn(
                'p-2 transition-colors border-l border-gray-200',
                visao === 'kanban'
                  ? 'bg-[#253B29] text-white'
                  : 'bg-white text-gray-500 hover:bg-gray-50'
              )}
            >
              <Columns className="h-4 w-4" />
            </button>
            <button
              onClick={() => setVisao('lista')}
              title="Visão Lista"
              className={cn(
                'p-2 transition-colors border-l border-gray-200',
                visao === 'lista'
                  ? 'bg-[#253B29] text-white'
                  : 'bg-white text-gray-500 hover:bg-gray-50'
              )}
            >
              <List className="h-4 w-4" />
            </button>
          </div>

          {/* Novo Lead */}
          {pode('leads.criar') && (
            <Button
              className="bg-[#253B29] hover:bg-[#1a2b1e] text-white gap-2 h-9"
              onClick={() => abrirModal()}
            >
              <UserPlus className="h-4 w-4" />
              Novo Lead
            </Button>
          )}
        </div>
      </div>

      {/* Conteúdo */}
      {visao === 'dashboard' && (
        <DashboardLeads onAbrirLead={abrirDetalhe} />
      )}
      {visao === 'kanban' && (
        <div className="overflow-x-auto pb-4">
          <KanbanBoard onCriarLead={abrirModal} onAbrirLead={abrirDetalhe} />
        </div>
      )}
      {visao === 'lista' && (
        <LeadListView
          busca={busca}
          faseId={faseIdFiltro}
          onFaseChange={setFaseIdFiltro}
          onAbrirLead={abrirDetalhe}
        />
      )}

      {/* Modal de criação */}
      <LeadModal
        aberto={modalAberto}
        onFechar={() => setModalAberto(false)}
        faseIdInicial={faseIdNovo}
      />

      {/* Modal de detalhe */}
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
