'use client'

import { useState } from 'react'
import { useSolicitacoesPorLead, useSolicitacoesPorProcesso, useSolicitacoesPorConversa } from '@/hooks/solicitacoes/useSolicitacoesEntidade'
import { useEnviarMensagemSolicitacao } from '@/hooks/solicitacoes/useEnviarMensagemSolicitacao'
import { useSolicitacaoMensagens } from '@/hooks/solicitacoes/useSolicitacaoMensagens'
import { useAuth } from '@/hooks/auth/useAuth'
import { SolicitacaoPrioridadeBadge } from './SolicitacaoPrioridadeBadge'
import { SolicitacaoStatusBadge } from './SolicitacaoStatusBadge'
import { SlaCountdown } from './SlaCountdown'
import { NovaSolicitacaoDrawer } from './NovaSolicitacaoDrawer'
import { MensagemBubble } from './MensagemBubble'
import { TIPO_LABELS, type ContextoSolicitacao } from '@/types/solicitacoes-operacionais'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Plus, ClipboardList, ChevronDown, ChevronRight, Paperclip, Send, MessageCircle } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { SolicitacaoOperacional } from '@/types/solicitacoes-operacionais'
import { supabase } from '@/lib/supabase'

interface Props {
  leadId?: string
  processoId?: string
  conversaId?: string
  pessoaId?: string
  compacto?: boolean
  contexto?: ContextoSolicitacao
}

function useSolicitacoes({ leadId, processoId, conversaId }: Omit<Props, 'pessoaId' | 'compacto'>) {
  const r1 = useSolicitacoesPorLead(leadId)
  const r2 = useSolicitacoesPorProcesso(processoId)
  const r3 = useSolicitacoesPorConversa(conversaId)
  if (leadId)     return r1
  if (processoId) return r2
  if (conversaId) return r3
  return { data: [], isLoading: false }
}

export function AbaSolicitacoes({ leadId, processoId, conversaId, pessoaId, compacto, contexto }: Props) {
  const [drawerAberto, setDrawerAberto] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const { data: solicitacoes = [], isLoading } = useSolicitacoes({ leadId, processoId, conversaId })

  const limite = compacto ? 3 : undefined
  const sorted = [...solicitacoes].sort((a, b) => {
    const aC = (a.status === 'concluido' || a.status === 'cancelado') ? 1 : 0
    const bC = (b.status === 'concluido' || b.status === 'cancelado') ? 1 : 0
    return aC - bC
  })
  const lista = limite ? sorted.slice(0, limite) : sorted

  function toggleExpand(id: string) {
    setExpandedId(prev => prev === id ? null : id)
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {!compacto && (
          <h4 className="text-sm font-semibold text-fonti-primary">
            Solicitações Operacionais
            {solicitacoes.length > 0 && (
              <span className="ml-1.5 text-xs text-gray-400 font-normal">({solicitacoes.length})</span>
            )}
          </h4>
        )}
        <Button
          size="sm"
          variant="outline"
          className="ml-auto w-full gap-1.5 text-xs sm:w-auto"
          onClick={() => setDrawerAberto(true)}
        >
          <Plus className="h-3.5 w-3.5" />
          Nova Solicitação
        </Button>
      </div>

      {/* Tabela */}
      {isLoading ? (
        <div className="space-y-2">
          {[1,2].map((i) => <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />)}
        </div>
      ) : lista.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-xs">Nenhuma solicitação vinculada</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="min-w-[720px] w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="w-6 px-3 py-2" />
                <th className="text-left px-3 py-2 text-gray-500 font-medium">Tipo</th>
                <th className="text-left px-3 py-2 text-gray-500 font-medium">Título</th>
                <th className="text-left px-3 py-2 text-gray-500 font-medium hidden sm:table-cell">Responsável</th>
                <th className="text-left px-3 py-2 text-gray-500 font-medium">Status</th>
                <th className="text-left px-3 py-2 text-gray-500 font-medium hidden md:table-cell">SLA</th>
                <th className="w-6 px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {lista.map((s) => (
                <SolicitacaoRow
                  key={s.id}
                  solicitacao={s}
                  expanded={expandedId === s.id}
                  onToggle={() => toggleExpand(s.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {compacto && solicitacoes.length > 3 && (
        <p className="text-xs text-center text-gray-400">
          +{solicitacoes.length - 3} mais → ver em Operacional
        </p>
      )}

      <NovaSolicitacaoDrawer
        aberto={drawerAberto}
        onFechar={() => setDrawerAberto(false)}
        leadId={leadId}
        processoId={processoId}
        conversaId={conversaId}
        pessoaId={pessoaId}
        contexto={contexto}
      />
    </div>
  )
}

// ── Linha da tabela com accordion ──────────────────────────────

interface SolicitacaoRowProps {
  solicitacao: SolicitacaoOperacional
  expanded: boolean
  onToggle: () => void
}

function SolicitacaoRow({ solicitacao: s, expanded, onToggle }: SolicitacaoRowProps) {
  const { usuario } = useAuth()
  const [textoMensagem, setTextoMensagem] = useState('')
  const [respondendo, setRespondendo] = useState(false)
  const { mutate: enviarMensagem, isPending } = useEnviarMensagemSolicitacao()
  const { data: mensagens = [] } = useSolicitacaoMensagens(s.retorno_operacional ? s.id : undefined)

  const concluido = s.status === 'concluido' || s.status === 'cancelado'
  const ultimaMensagem = mensagens[mensagens.length - 1]
  const temRespostaNova = !concluido && !!ultimaMensagem && ultimaMensagem.autor_id !== usuario?.id
  const temRetorno = !!s.retorno_operacional
  const totalMensagens = mensagens.length + (s.replica_comercial && mensagens.length === 0 ? 1 : 0)

  function nomeAutor(autorId: string) {
    const nome = autorId === s.responsavel?.id
      ? (s.responsavel.nome)
      : autorId === s.solicitante?.id
        ? (s.solicitante?.nome ?? 'Usuário')
        : 'Usuário'
    return autorId === usuario?.id ? `${nome} (você)` : nome
  }

  async function abrirAnexo() {
    if (!s.anexo_retorno_path) return
    const { data, error } = await supabase.storage
      .from('documentos')
      .createSignedUrl(s.anexo_retorno_path, 3600)
    if (!error && data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  function handleEnviar() {
    if (!textoMensagem.trim()) return
    enviarMensagem({ solicitacaoId: s.id, texto: textoMensagem.trim() }, {
      onSuccess: () => { setTextoMensagem(''); setRespondendo(false) },
      onError: (err) => toast.error(`Erro ao enviar: ${(err as { message?: string })?.message ?? 'Erro desconhecido'}`),
    })
  }

  return (
    <>
      {/* Linha principal */}
      <tr
        className={cn(
          'cursor-pointer transition-colors border-b border-gray-100 last:border-0',
          expanded ? 'bg-fonti-accent-hover/20' : concluido ? 'bg-gray-50 hover:bg-gray-100 opacity-70' : 'bg-white hover:bg-gray-50'
        )}
        onClick={onToggle}
      >
        {/* Indicador nova mensagem */}
        <td className="px-3 py-2.5 w-6">
          {temRespostaNova ? (
            <span className="block w-2 h-2 rounded-full bg-amber-400 animate-pulse" title="Nova resposta não lida" />
          ) : temRetorno && !concluido ? (
            <span className="block w-2 h-2 rounded-full bg-blue-300" title="Com retorno" />
          ) : (
            <span className="block w-2 h-2" />
          )}
        </td>

        {/* Tipo */}
        <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">
          {TIPO_LABELS[s.tipo]}
        </td>

        {/* Título + badge de mensagens */}
        <td className="px-3 py-2.5 max-w-[220px]">
          <div className="flex items-center gap-1.5">
            <span className="text-fonti-primary font-medium truncate">{s.titulo}</span>
            {totalMensagens > 0 && (
              <span className="shrink-0 flex items-center gap-0.5 text-[10px] text-gray-400">
                <MessageCircle className="h-3 w-3" />
                {totalMensagens}
              </span>
            )}
          </div>
          <SolicitacaoPrioridadeBadge prioridade={s.prioridade} />
        </td>

        {/* Responsável */}
        <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap hidden sm:table-cell">
          {s.responsavel?.nome ?? '—'}
        </td>

        {/* Status */}
        <td className="px-3 py-2.5">
          <SolicitacaoStatusBadge status={s.status} />
        </td>

        {/* SLA */}
        <td className="px-3 py-2.5 hidden md:table-cell">
          <SlaCountdown slaAt={s.sla_at} concluido={concluido} />
        </td>

        {/* Chevron */}
        <td className="px-3 py-2.5 text-gray-400">
          {expanded
            ? <ChevronDown className="h-3.5 w-3.5" />
            : <ChevronRight className="h-3.5 w-3.5" />
          }
        </td>
      </tr>

      {/* Linha expandida: detalhes + mensagens */}
      {expanded && (
        <tr className="border-b border-gray-100 last:border-0">
          <td colSpan={7} className="px-4 pb-4 pt-0 bg-fonti-accent-hover/10">
            <div className="border-l-2 border-fonti-accent pl-3 ml-2 space-y-3">

              {/* Descrição */}
              {s.descricao && (
                <div>
                  <p className="text-[10px] text-gray-400 uppercase font-medium mb-0.5">Descrição</p>
                  <p className="text-xs text-gray-700">{s.descricao}</p>
                </div>
              )}

              {/* Retorno operacional */}
              {s.retorno_operacional && (
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase font-medium mb-0.5">Retorno Operacional</p>
                      <p className="text-xs text-gray-700">{s.retorno_operacional}</p>
                    </div>
                    {s.anexo_retorno_path && (
                      <button onClick={(e) => { e.stopPropagation(); abrirAnexo() }}
                        className="shrink-0 text-gray-400 hover:text-fonti-primary transition-colors"
                        title="Abrir anexo"
                      >
                        <Paperclip className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Thread de mensagens */}
              {(mensagens.length > 0 || (s.replica_comercial && mensagens.length === 0)) && (
                <div className="space-y-1.5" onClick={(e) => e.stopPropagation()}>
                  {s.replica_comercial && mensagens.length === 0 && (
                    <MensagemBubble
                      texto={s.replica_comercial}
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
                      isResponsavel={m.autor_id === s.responsavel?.id}
                      createdAt={m.created_at}
                    />
                  ))}
                </div>
              )}

              {/* Responder */}
              {!!s.retorno_operacional && !concluido && !respondendo && (
                <button
                  onClick={(e) => { e.stopPropagation(); setRespondendo(true) }}
                  className="text-xs text-fonti-primary font-medium underline underline-offset-2 hover:text-fonti-accent transition-colors"
                >
                  {mensagens.length > 0 || s.replica_comercial ? 'Responder novamente' : 'Responder ao retorno'}
                </button>
              )}

              {!!s.retorno_operacional && !concluido && respondendo && (
                <div className="space-y-1.5" onClick={(e) => e.stopPropagation()}>
                  <Textarea
                    value={textoMensagem}
                    onChange={(e) => setTextoMensagem(e.target.value)}
                    placeholder="Escreva sua mensagem..."
                    className="text-xs min-h-[56px] resize-none"
                    autoFocus
                  />
                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button size="sm" variant="ghost" className="h-7 text-xs"
                      onClick={() => { setRespondendo(false); setTextoMensagem('') }} disabled={isPending}>
                      Cancelar
                    </Button>
                    <Button size="sm" className="h-7 text-xs bg-fonti-primary hover:bg-fonti-primary-hover text-white gap-1"
                      onClick={handleEnviar} disabled={!textoMensagem.trim() || isPending}>
                      <Send className="h-3 w-3" /> Enviar
                    </Button>
                  </div>
                </div>
              )}

            </div>
          </td>
        </tr>
      )}
    </>
  )
}
