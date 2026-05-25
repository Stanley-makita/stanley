'use client'

import { useState } from 'react'
import { useSolicitacoesFila, useSolicitacoesConcluidasFila } from '@/hooks/solicitacoes/useSolicitacoesFila'
import { useSolicitacaoMensagens } from '@/hooks/solicitacoes/useSolicitacaoMensagens'
import { useAuth } from '@/hooks/auth/useAuth'
import { SolicitacaoPrioridadeBadge } from '@/components/solicitacoes/SolicitacaoPrioridadeBadge'
import { SolicitacaoStatusBadge } from '@/components/solicitacoes/SolicitacaoStatusBadge'
import { SlaCountdown } from '@/components/solicitacoes/SlaCountdown'
import { ResponderSolicitacaoDrawer } from '@/components/solicitacoes/ResponderSolicitacaoDrawer'
import { NovaSolicitacaoDrawer } from '@/components/solicitacoes/NovaSolicitacaoDrawer'
import { TIPO_LABELS, PRIORIDADE_DOT, type TipoSolicitacao, type PrioridadeSolicitacao, type SolicitacaoOperacional } from '@/types/solicitacoes-operacionais'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ClipboardList, Plus, ExternalLink, ChevronDown, ChevronRight, MessageSquare } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function OperacionalPage() {
  const { usuario } = useAuth()
  const router = useRouter()

  const isGestor = usuario?.perfil === 'admin' || usuario?.perfil === 'gerente'

  const [filtroTipo, setFiltroTipo] = useState<TipoSolicitacao | 'all'>('all')
  const [filtroPrioridade, setFiltroPrioridade] = useState<PrioridadeSolicitacao | 'all'>('all')
  const [soMinhaFila, setSoMinhaFila] = useState(false)
  const [concluidasAbertas, setConcluidasAbertas] = useState(false)

  const [selecionada, setSelecionada] = useState<SolicitacaoOperacional | null>(null)
  const [novaAberta, setNovaAberta] = useState(false)

  const filtrosBase = {
    tipo: filtroTipo !== 'all' ? filtroTipo : undefined,
    prioridade: filtroPrioridade !== 'all' ? filtroPrioridade : undefined,
    todasDaEmpresa: isGestor ? !soMinhaFila : false,
  }

  const { data: ativas = [], isLoading } = useSolicitacoesFila(filtrosBase)
  const { data: concluidas = [], isLoading: loadingConcluidas } = useSolicitacoesConcluidasFila(filtrosBase)

  const urgentes = ativas.filter((s) => s.prioridade === 'urgente').length
  const vencidas = ativas.filter((s) => s.sla_at && new Date(s.sla_at) < new Date()).length

  function handleResponder(s: SolicitacaoOperacional) {
    setSelecionada(s)
  }

  function handleVerEntidade(s: SolicitacaoOperacional) {
    if (s.lead_id) router.push(`/leads/${s.lead_id}`)
    else if (s.processo_id) router.push(`/processos/${s.processo_id}`)
  }

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-bold text-[#253B29]">
            {isGestor && !soMinhaFila ? 'Fila Operacional — Empresa' : 'Minha Fila Operacional'}
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {isLoading ? 'Carregando...' : (
              <>
                {ativas.length} ativa{ativas.length !== 1 ? 's' : ''}
                {urgentes > 0 && <> · <span className="text-red-600">{urgentes} urgente{urgentes !== 1 ? 's' : ''}</span></>}
                {vencidas > 0 && <> · <span className="text-red-500">{vencidas} vencida{vencidas !== 1 ? 's' : ''}</span></>}
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

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap">
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

      {/* Lista Ativas */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      ) : ativas.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm font-medium">Fila limpa</p>
          <p className="text-xs mt-1">
            {isGestor && !soMinhaFila
              ? 'Nenhuma solicitação ativa na empresa'
              : 'Nenhuma solicitação ativa atribuída a você'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {ativas.map((s) => (
            <SolicitacaoCard
              key={s.id}
              solicitacao={s}
              onResponder={() => handleResponder(s)}
              onVerEntidade={() => handleVerEntidade(s)}
            />
          ))}
        </div>
      )}

      {/* Seção Concluídas */}
      <div>
        <button
          className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-600 transition-colors py-1"
          onClick={() => setConcluidasAbertas((v) => !v)}
        >
          {concluidasAbertas
            ? <ChevronDown className="h-3.5 w-3.5" />
            : <ChevronRight className="h-3.5 w-3.5" />}
          <span className="font-medium">
            Concluídas{!loadingConcluidas && concluidas.length > 0 && ` (${concluidas.length})`}
          </span>
        </button>

        {concluidasAbertas && (
          <div className="mt-2 space-y-2">
            {loadingConcluidas ? (
              <div className="space-y-2">
                {[1, 2].map((i) => <div key={i} className="h-14 bg-gray-50 rounded-xl animate-pulse" />)}
              </div>
            ) : concluidas.length === 0 ? (
              <p className="text-xs text-gray-400 py-4 text-center">Nenhuma solicitação concluída</p>
            ) : (
              concluidas.map((s) => (
                <SolicitacaoCard
                  key={s.id}
                  solicitacao={s}
                  concluida
                  onVerEntidade={() => handleVerEntidade(s)}
                />
              ))
            )}
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

function SolicitacaoCard({
  solicitacao: s,
  concluida = false,
  onResponder,
  onVerEntidade,
}: {
  solicitacao: SolicitacaoOperacional
  concluida?: boolean
  onResponder?: () => void
  onVerEntidade?: () => void
}) {
  const temEntidade = !!(s.lead_id || s.processo_id)
  const { data: mensagens = [] } = useSolicitacaoMensagens(
    s.retorno_operacional ? s.id : undefined
  )
  const totalMensagens = mensagens.length + (s.replica_comercial && mensagens.length === 0 ? 1 : 0)

  return (
    <div className={`bg-white border rounded-xl p-4 transition-colors ${
      concluida
        ? 'border-gray-100 opacity-60'
        : 'border-gray-200 hover:border-[#C2AA6A]/60'
    }`}>
      <div className="flex items-start gap-3">
        {/* Dot de prioridade */}
        {!concluida && (
          <div className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${PRIORIDADE_DOT[s.prioridade]}`} />
        )}

        <div className="flex-1 min-w-0">
          {/* Badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-500 font-medium">{TIPO_LABELS[s.tipo]}</span>
            <SolicitacaoPrioridadeBadge prioridade={s.prioridade} />
            <SolicitacaoStatusBadge status={s.status} />
          </div>

          {/* Título */}
          <p className="text-sm font-medium text-[#253B29] mt-1 leading-tight">{s.titulo}</p>

          {/* Meta: vínculo + SLA + indicador de conversa */}
          <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400 flex-wrap">
            {s.lead && <span>Lead: {s.lead.nome}</span>}
            {s.processo && <span>Processo: {s.processo.nome_imovel}</span>}
            {s.pessoa && !s.lead && !s.processo && <span>Pessoa: {s.pessoa.nome}</span>}
            {!s.lead && !s.processo && !s.pessoa && <span>Sem vínculo</span>}
            <SlaCountdown slaAt={s.sla_at} concluido={concluida} />
            {s.retorno_operacional && (
              <span className="flex items-center gap-1 text-gray-400">
                <MessageSquare className="h-3 w-3" />
                {totalMensagens > 0 ? `${totalMensagens} msg` : 'Retorno'}
              </span>
            )}
          </div>
        </div>

        {/* Ações */}
        {!concluida && (
          <div className="flex flex-col gap-1.5 shrink-0">
            <Button
              size="sm"
              className="h-7 text-xs bg-[#253B29] hover:bg-[#1a2b1e] text-white px-3"
              onClick={onResponder}
            >
              Responder
            </Button>
            {temEntidade && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1 px-3"
                onClick={onVerEntidade}
              >
                <ExternalLink className="h-3 w-3" />
                {s.lead_id ? 'Ver Lead' : 'Ver Processo'}
              </Button>
            )}
          </div>
        )}

        {concluida && temEntidade && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs gap-1 px-2 text-gray-400 shrink-0"
            onClick={onVerEntidade}
          >
            <ExternalLink className="h-3 w-3" />
            {s.lead_id ? 'Lead' : 'Processo'}
          </Button>
        )}
      </div>
    </div>
  )
}
