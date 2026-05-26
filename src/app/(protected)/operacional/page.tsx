'use client'

import { useState, useEffect, useRef } from 'react'
import { useSolicitacoesFila, useSolicitacoesConcluidasFila } from '@/hooks/solicitacoes/useSolicitacoesFila'
import { useSolicitacaoMensagens } from '@/hooks/solicitacoes/useSolicitacaoMensagens'
import { useAuth } from '@/hooks/auth/useAuth'
import { SolicitacaoPrioridadeBadge } from '@/components/solicitacoes/SolicitacaoPrioridadeBadge'
import { SlaCountdown } from '@/components/solicitacoes/SlaCountdown'
import { ResponderSolicitacaoDrawer } from '@/components/solicitacoes/ResponderSolicitacaoDrawer'
import { NovaSolicitacaoDrawer } from '@/components/solicitacoes/NovaSolicitacaoDrawer'
import {
  TIPO_LABELS, PRIORIDADE_DOT,
  type TipoSolicitacao, type PrioridadeSolicitacao, type SolicitacaoOperacional,
} from '@/types/solicitacoes-operacionais'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, ExternalLink, MessageSquare, Building2, User } from 'lucide-react'
import { useRouter } from 'next/navigation'

// ─── Colunas do Kanban ────────────────────────────────────────────────────────

const COLUNAS = [
  {
    id: 'em_andamento' as const,
    label: 'Em andamento',
    cor: '#3B82F6',
    statuses: ['pendente', 'em_andamento'] as string[],
  },
  {
    id: 'aguardando_resposta' as const,
    label: 'Aguardando resposta',
    cor: '#A855F7',
    statuses: ['aguardando_resposta'] as string[],
  },
  {
    id: 'aguardando_cliente' as const,
    label: 'Aguardando cliente',
    cor: '#F97316',
    statuses: ['aguardando_cliente'] as string[],
  },
  {
    id: 'concluido' as const,
    label: 'Concluído',
    cor: '#22C55E',
    statuses: ['concluido', 'cancelado'] as string[],
  },
]

// ─── Card do Kanban ───────────────────────────────────────────────────────────

function KanbanCard({
  s,
  onResponder,
}: {
  s: SolicitacaoOperacional
  onResponder: (s: SolicitacaoOperacional) => void
}) {
  const router = useRouter()
  const concluida = s.status === 'concluido' || s.status === 'cancelado'
  const { data: mensagens = [] } = useSolicitacaoMensagens(
    s.retorno_operacional ? s.id : undefined
  )
  const totalMensagens = mensagens.length + (s.replica_comercial && mensagens.length === 0 ? 1 : 0)
  const vencido = !concluida && s.sla_at && new Date(s.sla_at) < new Date()

  function navEntidade() {
    if (s.lead_id) router.push(`/leads/${s.lead_id}`)
    else if (s.processo_id) router.push(`/processos/${s.processo_id}`)
  }

  return (
    <div className={`bg-white border rounded-lg p-3 transition-all cursor-default ${
      concluida
        ? 'border-gray-100 opacity-60'
        : vencido
          ? 'border-red-200 hover:border-red-300'
          : 'border-gray-200 hover:border-[#C2AA6A]/60 hover:shadow-sm'
    }`}>
      {/* linha 1: prioridade dot + tipo + prioridade badge */}
      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
        {!concluida && (
          <div className={`w-2 h-2 rounded-full shrink-0 ${PRIORIDADE_DOT[s.prioridade]}`} />
        )}
        <span className="text-[11px] font-semibold text-gray-600">
          {TIPO_LABELS[s.tipo]}
        </span>
        <SolicitacaoPrioridadeBadge prioridade={s.prioridade} />
      </div>

      {/* título */}
      <p className="text-xs font-medium text-[#253B29] line-clamp-2 leading-snug mb-2">
        {s.titulo}
      </p>

      {/* solicitante */}
      {s.solicitante && (
        <div className="flex items-center gap-1 mb-1.5">
          <User className="h-3 w-3 text-gray-400 shrink-0" />
          <span className="text-[10px] text-gray-500 truncate">
            {s.solicitante.nome.split(' ')[0]}
          </span>
        </div>
      )}

      {/* vínculo: lead ou processo */}
      {(s.lead || s.processo || s.pessoa) && (
        <div className="flex items-center gap-1 mb-1.5">
          <ExternalLink className="h-3 w-3 text-gray-300 shrink-0" />
          <span className="text-[10px] text-gray-500 truncate">
            {s.lead
              ? `Lead: ${s.lead.nome}`
              : s.processo
                ? `Proc: ${s.processo.nome_imovel}`
                : `Pessoa: ${s.pessoa!.nome}`}
          </span>
        </div>
      )}

      {/* banco + produto (do processo) */}
      {s.processo && (s.processo.banco || s.processo.modalidade) && (
        <div className="flex items-center gap-1 mb-2">
          <Building2 className="h-3 w-3 text-gray-300 shrink-0" />
          <span className="text-[10px] text-gray-400 truncate">
            {[s.processo.banco?.nome, s.processo.modalidade].filter(Boolean).join(' · ')}
          </span>
        </div>
      )}

      {/* footer: SLA + mensagens + ações */}
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
            <Button
              size="sm"
              className="h-6 text-[10px] px-2 bg-[#253B29] hover:bg-[#1a2b1e] text-white"
              onClick={() => onResponder(s)}
            >
              Responder
            </Button>
          )}
          {(s.lead_id || s.processo_id) && (
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-[10px] px-1.5 gap-0.5"
              onClick={navEntidade}
            >
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

function KanbanColuna({
  label, cor, items, onResponder,
}: {
  label: string
  cor: string
  items: SolicitacaoOperacional[]
  onResponder: (s: SolicitacaoOperacional) => void
}) {
  return (
    <div className="flex flex-col min-w-[200px] max-w-[280px] flex-1">
      {/* cabeçalho */}
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cor }} />
          <span className="text-xs font-semibold text-gray-700 truncate">{label}</span>
        </div>
        <span className="text-xs font-medium text-gray-400 shrink-0 ml-2 tabular-nums">
          {items.length}
        </span>
      </div>

      {/* corpo */}
      <div className="flex-1 bg-gray-50/80 border border-gray-200 rounded-xl p-2 space-y-2 overflow-y-auto">
        {items.length === 0 ? (
          <p className="text-center py-6 text-[11px] text-gray-300">—</p>
        ) : (
          items.map((s) => (
            <KanbanCard key={s.id} s={s} onResponder={onResponder} />
          ))
        )}
      </div>
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

  const todas = [...ativas, ...concluidas]

  const urgentes = ativas.filter((s) => s.prioridade === 'urgente').length
  const vencidas = ativas.filter((s) => s.sla_at && new Date(s.sla_at) < new Date()).length

  // agrupar por coluna
  const porColuna = COLUNAS.map((col) => ({
    ...col,
    items: todas.filter((s) => col.statuses.includes(s.status)),
  }))

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 80px)' }}>
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3 px-6 pt-6 shrink-0">
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
            <Button
              variant={soMinhaFila ? 'default' : 'outline'}
              size="sm"
              className={soMinhaFila ? 'bg-[#253B29] text-white text-xs' : 'text-xs'}
              onClick={() => setSoMinhaFila((v) => !v)}
            >
              {soMinhaFila ? 'Minha fila' : 'Todas da empresa'}
            </Button>
          )}
          <Button
            size="sm"
            className="bg-[#253B29] hover:bg-[#1a2b1e] text-white gap-1.5"
            onClick={() => setNovaAberta(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            Nova Solicitação
          </Button>
        </div>
      </div>

      {/* ── Filtros ── */}
      <div className="flex gap-2 flex-wrap mb-3 px-6 shrink-0">
        <Select value={filtroTipo} onValueChange={(v) => setFiltroTipo(v as TipoSolicitacao | 'all')}>
          <SelectTrigger className="h-8 text-xs w-44">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            {(Object.entries(TIPO_LABELS) as [TipoSolicitacao, string][]).map(([v, l]) => (
              <SelectItem key={v} value={v}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filtroPrioridade} onValueChange={(v) => setFiltroPrioridade(v as PrioridadeSolicitacao | 'all')}>
          <SelectTrigger className="h-8 text-xs w-36">
            <SelectValue placeholder="Prioridade" />
          </SelectTrigger>
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
            Limpar filtros
          </Button>
        )}
      </div>

      {/* ── Kanban Board ── */}
      <div className="flex-1 min-h-0 px-6 pb-6">
        {isLoading || loadingConcluidas ? (
          <div className="flex gap-3 h-full">
            {COLUNAS.map((col) => (
              <div key={col.id} className="flex-1 min-w-[200px] animate-pulse bg-gray-100 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="flex gap-3 h-full overflow-x-auto">
            {porColuna.map((col) => (
              <KanbanColuna
                key={col.id}
                label={col.label}
                cor={col.cor}
                items={col.items}
                onResponder={setSelecionada}
              />
            ))}
          </div>
        )}
      </div>

      <ResponderSolicitacaoDrawer
        solicitacao={selecionada}
        onFechar={() => setSelecionada(null)}
      />

      <NovaSolicitacaoDrawer
        aberto={novaAberta}
        onFechar={() => setNovaAberta(false)}
      />
    </div>
  )
}
