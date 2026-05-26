'use client'

import { useState } from 'react'
import { useSolicitacoesFila, useSolicitacoesConcluidasFila } from '@/hooks/solicitacoes/useSolicitacoesFila'
import { useSolicitacaoMensagens } from '@/hooks/solicitacoes/useSolicitacaoMensagens'
import { useFases } from '@/hooks/configuracoes/useFases'
import { useAuth } from '@/hooks/auth/useAuth'
import { SolicitacaoPrioridadeBadge } from '@/components/solicitacoes/SolicitacaoPrioridadeBadge'
import { SolicitacaoStatusBadge } from '@/components/solicitacoes/SolicitacaoStatusBadge'
import { SlaCountdown } from '@/components/solicitacoes/SlaCountdown'
import { ResponderSolicitacaoDrawer } from '@/components/solicitacoes/ResponderSolicitacaoDrawer'
import { NovaSolicitacaoDrawer } from '@/components/solicitacoes/NovaSolicitacaoDrawer'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  TIPO_LABELS, PRIORIDADE_DOT,
  type TipoSolicitacao, type PrioridadeSolicitacao, type SolicitacaoOperacional,
} from '@/types/solicitacoes-operacionais'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, ExternalLink, MessageSquare, Building2, User, LayoutList } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { format, isToday } from 'date-fns'
import { ptBR } from 'date-fns/locale'

// ─── Mapeamento status → índice de fase (por ordem) ──────────────────────────

const STATUS_POR_COLUNA: string[][] = [
  ['pendente', 'em_andamento'],
  ['aguardando_resposta'],
  ['aguardando_cliente'],
  ['concluido', 'cancelado'],
]

const COLUNAS_PADRAO = [
  { label: 'Em andamento',       cor: '#3B82F6' },
  { label: 'Aguardando resposta', cor: '#A855F7' },
  { label: 'Aguardando cliente',  cor: '#F97316' },
  { label: 'Concluído hoje',      cor: '#22C55E' },
]

// ─── Card compacto ────────────────────────────────────────────────────────────

function KanbanCard({ s, onResponder }: {
  s: SolicitacaoOperacional
  onResponder: (s: SolicitacaoOperacional) => void
}) {
  const router = useRouter()
  const concluida = s.status === 'concluido' || s.status === 'cancelado'
  const { data: mensagens = [] } = useSolicitacaoMensagens(s.retorno_operacional ? s.id : undefined)
  const totalMensagens = mensagens.length + (s.replica_comercial && mensagens.length === 0 ? 1 : 0)
  const vencido = !concluida && s.sla_at && new Date(s.sla_at) < new Date()

  return (
    <div className={`bg-white border rounded-lg p-3 transition-all ${
      concluida ? 'border-gray-100 opacity-70'
        : vencido ? 'border-red-200 hover:border-red-300 hover:shadow-sm'
        : 'border-gray-200 hover:border-[#C2AA6A]/60 hover:shadow-sm'
    }`}>
      {/* tipo + prioridade */}
      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
        {!concluida && <div className={`w-2 h-2 rounded-full shrink-0 ${PRIORIDADE_DOT[s.prioridade]}`} />}
        <span className="text-[11px] font-semibold text-gray-600">{TIPO_LABELS[s.tipo]}</span>
        <SolicitacaoPrioridadeBadge prioridade={s.prioridade} />
      </div>

      {/* título */}
      <p className="text-xs font-medium text-[#253B29] line-clamp-2 leading-snug mb-2">{s.titulo}</p>

      {/* solicitante */}
      {s.solicitante && (
        <div className="flex items-center gap-1 mb-1.5">
          <User className="h-3 w-3 text-gray-400 shrink-0" />
          <span className="text-[10px] text-gray-500 truncate">{s.solicitante.nome.split(' ')[0]}</span>
        </div>
      )}

      {/* vínculo */}
      {(s.lead || s.processo) && (
        <div className="flex items-center gap-1 mb-1.5">
          <ExternalLink className="h-3 w-3 text-gray-300 shrink-0" />
          <span className="text-[10px] text-gray-500 truncate">
            {s.lead ? `Lead: ${s.lead.nome}` : `Proc: ${s.processo!.nome_imovel}`}
          </span>
        </div>
      )}

      {/* banco + produto */}
      {s.processo && (s.processo.banco || s.processo.modalidade) && (
        <div className="flex items-center gap-1 mb-2">
          <Building2 className="h-3 w-3 text-gray-300 shrink-0" />
          <span className="text-[10px] text-gray-400 truncate">
            {[s.processo.banco?.nome, s.processo.modalidade].filter(Boolean).join(' · ')}
          </span>
        </div>
      )}

      {/* footer */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-100 gap-1 flex-wrap">
        <div className="flex items-center gap-2">
          <SlaCountdown slaAt={s.sla_at} concluido={concluida} />
          {totalMensagens > 0 && (
            <span className="flex items-center gap-0.5 text-gray-400">
              <MessageSquare className="h-2.5 w-2.5" />
              <span className="text-[10px]">{totalMensagens}</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {!concluida && (
            <Button size="sm" className="h-6 text-[10px] px-2 bg-[#253B29] hover:bg-[#1a2b1e] text-white"
              onClick={() => onResponder(s)}>
              Responder
            </Button>
          )}
          {(s.lead_id || s.processo_id) && (
            <Button size="sm" variant="outline" className="h-6 text-[10px] px-1.5 gap-0.5"
              onClick={() => s.lead_id ? router.push(`/leads/${s.lead_id}`) : router.push(`/processos/${s.processo_id}`)}>
              <ExternalLink className="h-2.5 w-2.5" />
              {s.lead_id ? 'Lead' : 'Proc.'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Coluna ───────────────────────────────────────────────────────────────────

function KanbanColuna({ label, cor, items, onResponder }: {
  label: string; cor: string
  items: SolicitacaoOperacional[]
  onResponder: (s: SolicitacaoOperacional) => void
}) {
  return (
    <div className="flex flex-col min-w-[200px] max-w-[280px] flex-1">
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cor }} />
          <span className="text-xs font-semibold text-gray-700 truncate">{label}</span>
        </div>
        <span className="text-xs font-medium text-gray-400 shrink-0 ml-2 tabular-nums">{items.length}</span>
      </div>
      <div className="flex-1 bg-gray-50/80 border border-gray-200 rounded-xl p-2 space-y-2 overflow-y-auto">
        {items.length === 0
          ? <p className="text-center py-6 text-[11px] text-gray-300">—</p>
          : items.map((s) => <KanbanCard key={s.id} s={s} onResponder={onResponder} />)
        }
      </div>
    </div>
  )
}

// ─── Tabela Concluídas ────────────────────────────────────────────────────────

function TabelaConcluidas({ items, onVer }: {
  items: SolicitacaoOperacional[]
  onVer: (s: SolicitacaoOperacional) => void
}) {
  const router = useRouter()
  if (items.length === 0) return (
    <div className="text-center py-16 text-gray-400 text-sm">Nenhuma solicitação concluída.</div>
  )
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-200">
            {['Tipo', 'Título', 'Solicitante', 'Vínculo', 'Banco · Produto', 'Concluído em', 'Status'].map((h) => (
              <th key={h} className="px-3 py-2 text-left text-gray-400 font-medium whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((s) => (
            <tr
              key={s.id}
              className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
              onClick={() => onVer(s)}
            >
              <td className="px-3 py-2.5 whitespace-nowrap font-medium text-gray-700">{TIPO_LABELS[s.tipo]}</td>
              <td className="px-3 py-2.5 max-w-[220px]">
                <p className="truncate text-[#253B29]">{s.titulo}</p>
              </td>
              <td className="px-3 py-2.5 whitespace-nowrap text-gray-500">{s.solicitante?.nome.split(' ')[0] ?? '—'}</td>
              <td className="px-3 py-2.5 whitespace-nowrap">
                {s.lead ? (
                  <button className="text-blue-600 hover:underline flex items-center gap-1"
                    onClick={(e) => { e.stopPropagation(); router.push(`/leads/${s.lead_id}`) }}>
                    {s.lead.nome} <ExternalLink className="h-2.5 w-2.5" />
                  </button>
                ) : s.processo ? (
                  <button className="text-blue-600 hover:underline flex items-center gap-1"
                    onClick={(e) => { e.stopPropagation(); router.push(`/processos/${s.processo_id}`) }}>
                    {s.processo.nome_imovel} <ExternalLink className="h-2.5 w-2.5" />
                  </button>
                ) : <span className="text-gray-300">—</span>}
              </td>
              <td className="px-3 py-2.5 whitespace-nowrap text-gray-400">
                {s.processo ? [s.processo.banco?.nome, s.processo.modalidade].filter(Boolean).join(' · ') : '—'}
              </td>
              <td className="px-3 py-2.5 whitespace-nowrap text-gray-500">
                {s.concluido_em
                  ? format(new Date(s.concluido_em), "dd/MM/yy HH:mm", { locale: ptBR })
                  : '—'}
              </td>
              <td className="px-3 py-2.5">
                <SolicitacaoStatusBadge status={s.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function OperacionalPage() {
  const { usuario } = useAuth()
  const isGestor = usuario?.perfil === 'admin' || usuario?.perfil === 'gerente'

  const [filtroTipo, setFiltroTipo] = useState<TipoSolicitacao | 'all'>('all')
  const [filtroPrioridade, setFiltroPrioridade] = useState<PrioridadeSolicitacao | 'all'>('all')
  const [soMinhaFila, setSoMinhaFila] = useState(false)
  const [selecionada, setSelecionada] = useState<SolicitacaoOperacional | null>(null)
  const [novaAberta, setNovaAberta] = useState(false)

  const filtrosBase = {
    tipo: filtroTipo !== 'all' ? filtroTipo : undefined,
    prioridade: filtroPrioridade !== 'all' ? filtroPrioridade : undefined,
    todasDaEmpresa: isGestor ? !soMinhaFila : false,
  }

  const { data: ativas = [], isLoading } = useSolicitacoesFila(filtrosBase)
  const { data: concluidas = [], isLoading: loadingConcluidas } = useSolicitacoesConcluidasFila(filtrosBase)
  const { data: fasesConfig = [] } = useFases('fila_operacional')

  // Concluídas do dia corrente para a coluna do Kanban
  const concluidasHoje = concluidas.filter((s) =>
    s.concluido_em ? isToday(new Date(s.concluido_em)) : false
  )

  const urgentes = ativas.filter((s) => s.prioridade === 'urgente').length
  const vencidas = ativas.filter((s) => s.sla_at && new Date(s.sla_at) < new Date()).length

  // Definir colunas: usa fases do Configurações (cor + nome) mapeadas por ordem
  const colunas = STATUS_POR_COLUNA.map((statuses, idx) => {
    const fase = fasesConfig[idx]
    const padrao = COLUNAS_PADRAO[idx]
    const isUltima = idx === STATUS_POR_COLUNA.length - 1
    return {
      label: fase ? (isUltima ? `${fase.nome} (hoje)` : fase.nome) : padrao.label,
      cor: fase?.cor ?? padrao.cor,
      statuses,
      isUltima,
    }
  })

  // Agrupar por coluna
  const porColuna = colunas.map((col) => ({
    ...col,
    items: col.isUltima
      ? concluidasHoje
      : ativas.filter((s) => col.statuses.includes(s.status)),
  }))

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] px-6 pt-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3 shrink-0">
        <div>
          <h1 className="text-lg font-bold text-[#253B29]">
            {isGestor && !soMinhaFila ? 'Fila Operacional — Empresa' : 'Minha Fila Operacional'}
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {isLoading ? 'Carregando...' : (
              <>
                {ativas.length} ativa{ativas.length !== 1 ? 's' : ''}
                {urgentes > 0 && <> · <span className="text-red-600 font-medium">{urgentes} urgente{urgentes !== 1 ? 's' : ''}</span></>}
                {vencidas > 0 && <> · <span className="text-red-500 font-medium">{vencidas} vencida{vencidas !== 1 ? 's' : ''}</span></>}
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isGestor && (
            <Button variant={soMinhaFila ? 'default' : 'outline'} size="sm"
              className={soMinhaFila ? 'bg-[#253B29] text-white text-xs' : 'text-xs'}
              onClick={() => setSoMinhaFila((v) => !v)}>
              {soMinhaFila ? 'Minha fila' : 'Todas da empresa'}
            </Button>
          )}
          <Button size="sm" className="bg-[#253B29] hover:bg-[#1a2b1e] text-white gap-1.5"
            onClick={() => setNovaAberta(true)}>
            <Plus className="h-3.5 w-3.5" /> Nova Solicitação
          </Button>
        </div>
      </div>

      {/* ── Filtros ── */}
      <div className="flex gap-2 flex-wrap mb-3 shrink-0">
        <Select value={filtroTipo} onValueChange={(v) => setFiltroTipo(v as TipoSolicitacao | 'all')}>
          <SelectTrigger className="h-8 text-xs w-44"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            {(Object.entries(TIPO_LABELS) as [TipoSolicitacao, string][]).map(([v, l]) => (
              <SelectItem key={v} value={v}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filtroPrioridade} onValueChange={(v) => setFiltroPrioridade(v as PrioridadeSolicitacao | 'all')}>
          <SelectTrigger className="h-8 text-xs w-36"><SelectValue placeholder="Prioridade" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="urgente">Urgente</SelectItem>
            <SelectItem value="alta">Alta</SelectItem>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="baixa">Baixa</SelectItem>
          </SelectContent>
        </Select>

        {(filtroTipo !== 'all' || filtroPrioridade !== 'all') && (
          <Button variant="ghost" size="sm" className="h-8 text-xs text-gray-400"
            onClick={() => { setFiltroTipo('all'); setFiltroPrioridade('all') }}>
            Limpar
          </Button>
        )}
      </div>

      {/* ── Tabs: Fila | Concluídas ── */}
      <Tabs defaultValue="fila" className="flex flex-col flex-1 min-h-0">
        <TabsList className="bg-gray-100 h-9 w-fit mb-3 shrink-0">
          <TabsTrigger value="fila" className="text-xs data-[state=active]:bg-[#253B29] data-[state=active]:text-white">
            Fila ativa
          </TabsTrigger>
          <TabsTrigger value="concluidas" className="text-xs data-[state=active]:bg-[#253B29] data-[state=active]:text-white gap-1.5">
            <LayoutList className="h-3.5 w-3.5" />
            Concluídas {!loadingConcluidas && concluidas.length > 0 && `(${concluidas.length})`}
          </TabsTrigger>
        </TabsList>

        {/* Kanban */}
        <TabsContent value="fila" className="flex-1 min-h-0 m-0">
          {isLoading ? (
            <div className="flex gap-3 h-full">
              {COLUNAS_PADRAO.map((c) => (
                <div key={c.label} className="flex-1 min-w-[200px] animate-pulse bg-gray-100 rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="flex gap-3 h-full overflow-x-auto pb-4">
              {porColuna.map((col) => (
                <KanbanColuna key={col.label} label={col.label} cor={col.cor}
                  items={col.items} onResponder={setSelecionada} />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Tabela concluídas */}
        <TabsContent value="concluidas" className="flex-1 min-h-0 m-0 overflow-y-auto">
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            {loadingConcluidas
              ? <div className="p-8 text-center text-gray-400 text-sm">Carregando...</div>
              : <TabelaConcluidas items={concluidas} onVer={setSelecionada} />
            }
          </div>
        </TabsContent>
      </Tabs>

      <ResponderSolicitacaoDrawer
        solicitacao={selecionada}
        onFechar={() => setSelecionada(null)}
      />

      <NovaSolicitacaoDrawer aberto={novaAberta} onFechar={() => setNovaAberta(false)} />
    </div>
  )
}
