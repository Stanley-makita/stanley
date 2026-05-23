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
import { TIPO_LABELS, type ContextoSolicitacao } from '@/types/solicitacoes-operacionais'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Plus, ClipboardList, Paperclip, Send } from 'lucide-react'
import { toast } from 'sonner'
import type { SolicitacaoOperacional } from '@/types/solicitacoes-operacionais'
import { supabase } from '@/lib/supabase'
import { MensagemBubble } from './MensagemBubble'

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

  if (leadId) return r1
  if (processoId) return r2
  if (conversaId) return r3
  return { data: [], isLoading: false }
}

export function AbaSolicitacoes({ leadId, processoId, conversaId, pessoaId, compacto, contexto }: Props) {
  const [drawerAberto, setDrawerAberto] = useState(false)
  const [replicandoId, setReplicandoId] = useState<string | null>(null)
  const { data: solicitacoes = [], isLoading } = useSolicitacoes({ leadId, processoId, conversaId })

  const limite = compacto ? 3 : undefined
  const sorted = [...solicitacoes].sort((a, b) => {
    const aConcluido = (a.status === 'concluido' || a.status === 'cancelado') ? 1 : 0
    const bConcluido = (b.status === 'concluido' || b.status === 'cancelado') ? 1 : 0
    return aConcluido - bConcluido
  })
  const lista = limite ? sorted.slice(0, limite) : sorted

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        {!compacto && (
          <h4 className="text-sm font-semibold text-[#253B29]">
            Solicitações Operacionais
            {solicitacoes.length > 0 && (
              <span className="ml-1.5 text-xs text-gray-400 font-normal">({solicitacoes.length})</span>
            )}
          </h4>
        )}
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 text-xs ml-auto"
          onClick={() => setDrawerAberto(true)}
        >
          <Plus className="h-3.5 w-3.5" />
          Nova Solicitação
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1,2].map((i) => <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />)}
        </div>
      ) : lista.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-xs">Nenhuma solicitação vinculada</p>
        </div>
      ) : (
        <div className="space-y-2">
          {lista.map((s) => (
            <SolicitacaoItem
              key={s.id}
              solicitacao={s}
              replicandoId={replicandoId}
              onAbrirReplica={setReplicandoId}
              onFecharReplica={() => setReplicandoId(null)}
            />
          ))}
          {compacto && solicitacoes.length > 3 && (
            <p className="text-xs text-center text-gray-400">
              +{solicitacoes.length - 3} mais → ver em Operacional
            </p>
          )}
        </div>
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

interface SolicitacaoItemProps {
  solicitacao: SolicitacaoOperacional
  replicandoId: string | null
  onAbrirReplica: (id: string) => void
  onFecharReplica: () => void
}

function SolicitacaoItem({ solicitacao: s, replicandoId, onAbrirReplica, onFecharReplica }: SolicitacaoItemProps) {
  const { usuario } = useAuth()
  const concluido = s.status === 'concluido' || s.status === 'cancelado'
  const [textoMensagem, setTextoMensagem] = useState('')
  const { mutate: enviarMensagem, isPending } = useEnviarMensagemSolicitacao()
  const { data: mensagens = [] } = useSolicitacaoMensagens(s.retorno_operacional ? s.id : undefined)

  // Pode responder se há retorno E não está concluído — sem limite de vezes
  const podeResponder = !!s.retorno_operacional && !concluido
  const estaAberta = replicandoId === s.id

  // Retrocompatibilidade: mostra replica_comercial se não há mensagens novas
  const mostrarReplicaLegada = !!s.replica_comercial && mensagens.length === 0

  // Dot de nova resposta: última mensagem é do outro lado (não do usuário atual)
  const ultimaMensagem = mensagens[mensagens.length - 1]
  const temRespostaNova = !concluido && !!ultimaMensagem && ultimaMensagem.autor_id !== usuario?.id

  // Sempre retorna nome real; adiciona "(você)" para identificar a própria mensagem
  function nomeAutor(autorId: string): string {
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
      onSuccess: () => {
        setTextoMensagem('')
        onFecharReplica()
      },
      onError: (err) => {
        const msg = (err as { message?: string })?.message ?? 'Erro desconhecido'
        toast.error(`Erro ao enviar: ${msg}`)
      },
    })
  }

  function handleFechar() {
    setTextoMensagem('')
    onFecharReplica()
  }

  return (
    <div className={`rounded-lg border p-3 space-y-2 ${concluido ? 'bg-gray-50 opacity-70' : 'bg-white'}`}>
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-gray-500">{TIPO_LABELS[s.tipo]}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <p className="text-sm text-[#253B29] font-medium leading-tight truncate">{s.titulo}</p>
            {temRespostaNova && (
              <span className="shrink-0 w-2 h-2 rounded-full bg-amber-400 animate-pulse" title="Nova resposta" />
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <SolicitacaoPrioridadeBadge prioridade={s.prioridade} />
          <SolicitacaoStatusBadge status={s.status} />
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>{s.responsavel?.nome ?? 'Sem responsável'}</span>
        <SlaCountdown slaAt={s.sla_at} concluido={concluido} />
      </div>

      {/* Retorno do operacional */}
      {s.retorno_operacional && (
        <div className="mt-1 pt-2 border-t border-gray-100 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs text-gray-500 font-medium">Retorno:</p>
              <p className="text-xs text-gray-700 mt-0.5 line-clamp-2">{s.retorno_operacional}</p>
            </div>
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

          {/* Thread de mensagens */}
          {(mensagens.length > 0 || mostrarReplicaLegada) && (
            <div className="space-y-1.5 pt-1">
              {/* Mensagem legada (replica_comercial) — sempre do lado comercial */}
              {mostrarReplicaLegada && (
                <MensagemBubble
                  texto={s.replica_comercial!}
                  autorNome={s.solicitante?.nome ?? 'Comercial'}
                  isPropio={s.solicitante?.id === usuario?.id}
                  isResponsavel={false}
                  createdAt={s.replica_em ?? undefined}
                />
              )}
              {/* Mensagens novas */}
              {mensagens.map((m) => {
                const isPropio = m.autor_id === usuario?.id
                const isResponsavel = m.autor_id === s.responsavel?.id
                return (
                  <MensagemBubble
                    key={m.id}
                    texto={m.texto}
                    autorNome={nomeAutor(m.autor_id)}
                    isPropio={isPropio}
                    isResponsavel={isResponsavel}
                    createdAt={m.created_at}
                  />
                )
              })}
            </div>
          )}

          {/* Botão para abrir campo de resposta */}
          {podeResponder && !estaAberta && (
            <button
              onClick={() => onAbrirReplica(s.id)}
              className="text-xs text-[#253B29] font-medium underline underline-offset-2 hover:text-[#C2AA6A] transition-colors"
            >
              {mensagens.length > 0 || mostrarReplicaLegada ? 'Responder novamente' : 'Responder ao retorno'}
            </button>
          )}

          {/* Campo de resposta */}
          {podeResponder && estaAberta && (
            <div className="space-y-1.5">
              <Textarea
                value={textoMensagem}
                onChange={(e) => setTextoMensagem(e.target.value)}
                placeholder="Escreva sua mensagem..."
                className="text-xs min-h-[64px] resize-none"
                autoFocus
              />
              <div className="flex gap-2 justify-end">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs text-gray-500"
                  onClick={handleFechar}
                  disabled={isPending}
                >
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  className="h-7 text-xs bg-[#253B29] hover:bg-[#1a2b1e] text-white gap-1"
                  onClick={handleEnviar}
                  disabled={!textoMensagem.trim() || isPending}
                >
                  <Send className="h-3 w-3" />
                  Enviar
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

