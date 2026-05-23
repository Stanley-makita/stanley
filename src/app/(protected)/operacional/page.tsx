'use client'

import { useState } from 'react'
import { useSolicitacoesFila } from '@/hooks/solicitacoes/useSolicitacoesFila'
import { useAuth } from '@/hooks/auth/useAuth'
import { SolicitacaoPrioridadeBadge } from '@/components/solicitacoes/SolicitacaoPrioridadeBadge'
import { SolicitacaoStatusBadge } from '@/components/solicitacoes/SolicitacaoStatusBadge'
import { SlaCountdown } from '@/components/solicitacoes/SlaCountdown'
import { ResponderSolicitacaoDrawer } from '@/components/solicitacoes/ResponderSolicitacaoDrawer'
import { NovaSolicitacaoDrawer } from '@/components/solicitacoes/NovaSolicitacaoDrawer'
import { TIPO_LABELS, PRIORIDADE_DOT, type TipoSolicitacao, type StatusSolicitacao, type PrioridadeSolicitacao, type SolicitacaoOperacional } from '@/types/solicitacoes-operacionais'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { ClipboardList, Plus, ExternalLink, Paperclip } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useSolicitacaoMensagens } from '@/hooks/solicitacoes/useSolicitacaoMensagens'
import { MensagemBubble } from '@/components/solicitacoes/MensagemBubble'

export default function OperacionalPage() {
  const { usuario } = useAuth()
  const router = useRouter()

  const isGestor = usuario?.perfil === 'admin' || usuario?.perfil === 'gerente'

  const [filtroTipo, setFiltroTipo] = useState<TipoSolicitacao | 'all'>('all')
  const [filtroStatus, setFiltroStatus] = useState<StatusSolicitacao | 'all'>('all')
  const [filtroPrioridade, setFiltroPrioridade] = useState<PrioridadeSolicitacao | 'all'>('all')
  // Gestores veem todas por padrão; não-gestores veem só a própria fila
  const [soMinhaFila, setSoMinhaFila] = useState(false)

  const [selecionada, setSelecionada] = useState<SolicitacaoOperacional | null>(null)
  const [novaAberta, setNovaAberta] = useState(false)

  const { data: solicitacoes = [], isLoading } = useSolicitacoesFila({
    tipo: filtroTipo !== 'all' ? filtroTipo : undefined,
    status: filtroStatus !== 'all' ? filtroStatus : undefined,
    prioridade: filtroPrioridade !== 'all' ? filtroPrioridade : undefined,
    todasDaEmpresa: isGestor ? !soMinhaFila : false,
  })

  const urgentes = solicitacoes.filter((s) => s.prioridade === 'urgente').length
  const vencidas = solicitacoes.filter((s) => s.sla_at && new Date(s.sla_at) < new Date()).length

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
                {solicitacoes.length} pendente{solicitacoes.length !== 1 ? 's' : ''}
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

        {(filtroTipo !== 'all' || filtroStatus !== 'all' || filtroPrioridade !== 'all') && (
          <Button variant="ghost" size="sm" className="h-8 text-xs text-gray-400"
            onClick={() => { setFiltroTipo('all'); setFiltroStatus('all'); setFiltroPrioridade('all') }}>
            Limpar filtros
          </Button>
        )}
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="space-y-3">
          {[1,2,3].map((i) => <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      ) : solicitacoes.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm font-medium">Fila limpa</p>
          <p className="text-xs mt-1">
            {isGestor && !soMinhaFila
              ? 'Nenhuma solicitação pendente na empresa'
              : 'Nenhuma solicitação pendente atribuída a você'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {solicitacoes.map((s) => (
            <SolicitacaoCard
              key={s.id}
              solicitacao={s}
              onResponder={() => setSelecionada(s)}
              onVerEntidade={() => {
                if (s.lead_id) router.push(`/leads/${s.lead_id}`)
                else if (s.processo_id) router.push(`/processos/${s.processo_id}`)
              }}
            />
          ))}
        </div>
      )}

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
  onResponder,
  onVerEntidade,
}: {
  solicitacao: SolicitacaoOperacional
  onResponder: () => void
  onVerEntidade: () => void
}) {
  const { usuario } = useAuth()
  const temEntidade = !!(s.lead_id || s.processo_id)
  const { data: mensagens = [] } = useSolicitacaoMensagens(
    s.retorno_operacional ? s.id : undefined
  )
  const mostrarReplicaLegada = !!s.replica_comercial && mensagens.length === 0

  async function abrirAnexo() {
    if (!s.anexo_retorno_path) return
    const { data, error } = await supabase.storage
      .from('documentos')
      .createSignedUrl(s.anexo_retorno_path, 3600)
    if (!error && data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  function nomeAutor(autorId: string): string {
    const nome = autorId === s.responsavel?.id
      ? s.responsavel.nome
      : autorId === s.solicitante?.id
        ? (s.solicitante?.nome ?? 'Comercial')
        : 'Usuário'
    return autorId === usuario?.id ? `${nome} (você)` : nome
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 hover:border-[#C2AA6A]/60 transition-colors">
      <div className="flex items-start gap-3">
        {/* Dot de prioridade */}
        <div className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${PRIORIDADE_DOT[s.prioridade]}`} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-500 font-medium">{TIPO_LABELS[s.tipo]}</span>
            <SolicitacaoPrioridadeBadge prioridade={s.prioridade} />
            <SolicitacaoStatusBadge status={s.status} />
          </div>

          <p className="text-sm font-medium text-[#253B29] mt-1 leading-tight">{s.titulo}</p>

          <div className="flex items-center gap-3 mt-2 text-xs text-gray-400 flex-wrap">
            {s.lead && <span>Lead: {s.lead.nome}</span>}
            {s.processo && <span>Processo: {s.processo.nome_imovel}</span>}
            {s.pessoa && !s.lead && !s.processo && <span>Pessoa: {s.pessoa.nome}</span>}
            {!s.lead && !s.processo && !s.pessoa && <span>Sem vínculo</span>}
            <SlaCountdown slaAt={s.sla_at} />
          </div>

          {s.retorno_operacional && (
            <div className="mt-2 pt-2 border-t border-gray-100 space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs text-gray-500 line-clamp-1 flex-1">
                  <span className="font-medium">Retorno:</span> {s.retorno_operacional}
                </p>
                {s.anexo_retorno_path && (
                  <button
                    onClick={abrirAnexo}
                    title="Abrir anexo"
                    className="shrink-0 p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-[#253B29] transition-colors"
                  >
                    <Paperclip className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {(mensagens.length > 0 || mostrarReplicaLegada) && (
                <div className="space-y-1.5 pt-0.5">
                  {mostrarReplicaLegada && (
                    <MensagemBubble
                      texto={s.replica_comercial!}
                      autorNome={s.solicitante?.nome ?? 'Comercial'}
                      isPropio={s.solicitante?.id === usuario?.id}
                      isResponsavel={false}
                      createdAt={s.replica_em ?? undefined}
                    />
                  )}
                  {mensagens.map((m) => (
                    <MensagemBubble
                      key={m.id}
                      texto={m.texto}
                      autorNome={nomeAutor(m.autor_id)}
                      isPropio={m.autor_id === usuario?.id}
                      isResponsavel={m.autor_id === s.responsavel_id}
                      createdAt={m.created_at}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1.5 shrink-0">
          <Button size="sm" className="h-7 text-xs bg-[#253B29] hover:bg-[#1a2b1e] text-white px-3" onClick={onResponder}>
            Responder
          </Button>
          {temEntidade && (
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1 px-3" onClick={onVerEntidade}>
              <ExternalLink className="h-3 w-3" />
              {s.lead_id ? 'Ver Lead' : 'Ver Processo'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
