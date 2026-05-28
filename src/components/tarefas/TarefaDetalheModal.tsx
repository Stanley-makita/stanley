'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO, isToday, isBefore } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  CheckCircle2, Circle, Pencil, ArrowUpRight,
  MessageSquare, Send, Clock, Calendar, Loader2, Tag, AlertTriangle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { TarefaFormModal, type TarefaFormData } from '@/components/tarefas/TarefaFormModal'
import {
  useProcessoTarefaById, useLeadTarefaById,
  useProcessoTarefaComentarios, useComentarProcessoTarefa,
  useEditarProcessoTarefa, useConcluirProcessoTarefaById,
} from '@/hooks/processos/useProcessoTarefaComentarios'
import {
  useLeadTarefaComentarios, useComentarLeadTarefa,
} from '@/hooks/leads/useLeadTarefas'
import { supabase } from '@/lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

interface Props {
  tarefaId: string | null
  fonte: 'processo' | 'lead'
  onFechar: () => void
}

const PRIORIDADE_CONFIG = {
  urgente: { label: 'Urgente', className: 'bg-red-100 text-red-800',   icone: AlertTriangle },
  alta:    { label: 'Alta',    className: 'bg-red-50 text-red-600',    icone: AlertTriangle },
  media:   { label: 'Média',   className: 'bg-amber-50 text-amber-600', icone: Clock },
  baixa:   { label: 'Baixa',   className: 'bg-gray-50 text-gray-500',   icone: Clock },
} as const

export function TarefaDetalheModal({ tarefaId, fonte, onFechar }: Props) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [editando, setEditando] = useState(false)
  const [comentario, setComentario] = useState('')

  // ── Dados da tarefa ──────────────────────────────────────────────────────
  const ptQuery = useProcessoTarefaById(fonte === 'processo' ? tarefaId : null)
  const ltQuery = useLeadTarefaById(fonte === 'lead' ? tarefaId : null)
  const tarefa  = fonte === 'processo' ? ptQuery.data : ltQuery.data
  const loading = fonte === 'processo' ? ptQuery.isLoading : ltQuery.isLoading

  // ── Comentários ─────────────────────────────────────────────────────────
  const ptComents  = useProcessoTarefaComentarios(fonte === 'processo' ? tarefaId : null)
  const ltComents  = useLeadTarefaComentarios(fonte === 'lead' ? tarefaId : null)
  const comentarios = (fonte === 'processo' ? ptComents.data : ltComents.data) ?? []

  const comentarPT = useComentarProcessoTarefa(tarefaId ?? '')
  const comentarLT = useComentarLeadTarefa(tarefaId ?? '')

  // ── Ações ────────────────────────────────────────────────────────────────
  const concluirPT = useConcluirProcessoTarefaById(tarefaId ?? '')
  const editarPT   = useEditarProcessoTarefa(tarefaId ?? '')

  function handleConcluir() {
    if (!tarefa) return
    if (fonte === 'processo') {
      concluirPT.mutate(!tarefa.concluida)
    } else {
      // Lead: direct update
      supabase
        .from('lead_tarefas')
        .update({
          concluida:    !tarefa.concluida,
          status:       !tarefa.concluida ? 'concluida' : 'pendente',
          concluida_em: !tarefa.concluida ? new Date().toISOString() : null,
        })
        .eq('id', tarefaId!)
        .then(({ error }) => {
          if (error) toast.error('Erro ao atualizar tarefa.')
          else {
            queryClient.invalidateQueries({ queryKey: ['lead-tarefa', tarefaId] })
            queryClient.invalidateQueries({ queryKey: ['agenda-tarefas'] })
          }
        })
    }
  }

  function handleEnviarComentario() {
    if (!comentario.trim()) return
    if (fonte === 'processo') {
      comentarPT.mutate(comentario.trim(), { onSuccess: () => setComentario('') })
    } else {
      comentarLT.mutate(comentario.trim(), { onSuccess: () => setComentario('') })
    }
  }

  async function handleSalvarEdicao(dados: TarefaFormData) {
    if (fonte === 'processo') {
      await editarPT.mutateAsync({
        titulo:          dados.titulo,
        descricao:       dados.descricao ?? null,
        categoria:       dados.categoria,
        prioridade:      dados.prioridade,
        responsavel_id:  dados.responsavel_id ?? null,
        data_prazo:      dados.data_prazo ?? null,
        horario_inicio:  dados.horario_inicio ?? null,
        horario_termino: dados.horario_termino ?? null,
      })
    } else {
      const { error } = await supabase
        .from('lead_tarefas')
        .update({
          titulo:          dados.titulo,
          descricao:       dados.descricao ?? null,
          categoria:       dados.categoria,
          prioridade:      dados.prioridade,
          responsavel_id:  dados.responsavel_id ?? null,
          data_prazo:      dados.data_prazo ?? null,
          horario_inicio:  dados.horario_inicio ?? null,
          horario_termino: dados.horario_termino ?? null,
        })
        .eq('id', tarefaId!)
      if (error) throw error
      queryClient.invalidateQueries({ queryKey: ['lead-tarefa', tarefaId] })
      queryClient.invalidateQueries({ queryKey: ['agenda-tarefas'] })
      toast.success('Tarefa atualizada.', {
        className: 'border-l-4 border-l-[#C2AA6A] bg-[#E7E0C4] text-[#253B29]',
      })
    }
    setEditando(false)
  }

  function handleNavegar() {
    if (!tarefa) return
    if (fonte === 'processo' && tarefa.processo_id) {
      router.push(`/processos/${tarefa.processo_id}`)
      onFechar()
    } else if (fonte === 'lead' && tarefa.lead_id) {
      router.push(`/leads/${tarefa.lead_id}`)
      onFechar()
    }
  }

  // ── Computados ───────────────────────────────────────────────────────────
  const vencimento = tarefa?.data_prazo ? parseISO(tarefa.data_prazo) : null
  const estaVencida = vencimento && !tarefa?.concluida && isBefore(vencimento, new Date()) && !isToday(vencimento)
  const prioridadeKey = (tarefa?.prioridade as keyof typeof PRIORIDADE_CONFIG) ?? 'media'
  const prioConfig = PRIORIDADE_CONFIG[prioridadeKey]
  const Icone = prioConfig.icone

  const nomeOrigem = fonte === 'processo'
    ? (tarefa as any)?.processo?.compradores?.find((c: any) => c.principal)?.nome
      ?? (tarefa as any)?.processo?.compradores?.[0]?.nome
      ?? (tarefa as any)?.processo?.nome_imovel ?? ''
    : (tarefa as any)?.lead?.nome ?? ''
  const numeroOrigem = fonte === 'processo'
    ? `#${(tarefa as any)?.processo?.numero_processo ?? ''}`
    : 'Lead'

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <>
      <Dialog open={!!tarefaId} onOpenChange={(v) => { if (!v) onFechar() }}>
        <DialogContent className="max-w-lg p-0 max-h-[90vh] flex flex-col">
          <DialogHeader className="px-6 pt-5 pb-4 border-b border-gray-100 shrink-0">
            <div className="flex items-start justify-between gap-3">
              <DialogTitle className="text-[#253B29] text-base font-semibold leading-snug">
                {loading ? '...' : tarefa?.titulo}
              </DialogTitle>
              <div className="flex gap-1.5 shrink-0">
                <button
                  onClick={() => setEditando(true)}
                  className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                  title="Editar"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Origem */}
            {(nomeOrigem || numeroOrigem) && (
              <button
                onClick={handleNavegar}
                className="flex items-center gap-1 text-xs text-[#253B29]/70 hover:text-[#253B29] hover:underline mt-0.5 w-fit"
              >
                <span>{numeroOrigem} · {nomeOrigem}</span>
                <ArrowUpRight className="h-3 w-3" />
              </button>
            )}
          </DialogHeader>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-gray-300" />
              </div>
            ) : tarefa ? (
              <div className="px-6 py-4 space-y-4">
                {/* Badges de info */}
                <div className="flex flex-wrap gap-2">
                  {/* Prioridade */}
                  <span className={cn('flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium', prioConfig.className)}>
                    <Icone className="h-3 w-3" />
                    {prioConfig.label}
                  </span>

                  {/* Categoria */}
                  {tarefa.categoria && (
                    <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600 font-medium capitalize">
                      <Tag className="h-3 w-3" />
                      {tarefa.categoria}
                    </span>
                  )}

                  {/* Status */}
                  <span className={cn(
                    'flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium',
                    tarefa.concluida
                      ? 'bg-green-50 text-green-700'
                      : estaVencida
                      ? 'bg-red-50 text-red-600'
                      : 'bg-blue-50 text-blue-600'
                  )}>
                    {tarefa.concluida ? 'Concluída' : estaVencida ? 'Vencida' : 'Pendente'}
                  </span>
                </div>

                {/* Data e horário */}
                {(vencimento || tarefa.horario_inicio) && (
                  <div className="flex items-center gap-3 text-sm text-gray-600">
                    {vencimento && (
                      <span className={cn('flex items-center gap-1', estaVencida && !tarefa.concluida && 'text-red-600 font-medium')}>
                        <Calendar className="h-3.5 w-3.5" />
                        {format(vencimento, "dd 'de' MMM 'de' yyyy", { locale: ptBR })}
                      </span>
                    )}
                    {(tarefa.horario_inicio || tarefa.horario_termino) && (
                      <span className="flex items-center gap-1 text-gray-400">
                        <Clock className="h-3.5 w-3.5" />
                        {tarefa.horario_inicio?.slice(0, 5)}
                        {tarefa.horario_termino ? ` – ${tarefa.horario_termino.slice(0, 5)}` : ''}
                      </span>
                    )}
                  </div>
                )}

                {/* Responsável */}
                {tarefa.responsavel?.nome && (
                  <p className="text-sm text-gray-500">
                    Responsável: <span className="font-medium text-gray-700">{tarefa.responsavel.nome}</span>
                  </p>
                )}

                {/* Descrição */}
                {tarefa.descricao && (
                  <div className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3 leading-relaxed">
                    {tarefa.descricao}
                  </div>
                )}

                {/* Conclusão */}
                {tarefa.concluida && tarefa.concluida_em && (
                  <p className="text-xs text-green-600">
                    Concluída em {format(parseISO(tarefa.concluida_em), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </p>
                )}

                {/* Seção de comentários */}
                <div className="border-t pt-4 space-y-3">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    <MessageSquare className="h-3.5 w-3.5" />
                    Comentários
                  </div>

                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {comentarios.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center py-3">Nenhum comentário ainda.</p>
                    ) : (
                      comentarios.map((c: any) => (
                        <div key={c.id} className="bg-gray-50 rounded-lg p-2.5">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-xs font-medium text-gray-700">{c.usuario?.nome ?? 'Usuário'}</span>
                            <span className="text-[10px] text-gray-400">
                              {format(parseISO(c.created_at), "dd/MM HH:mm")}
                            </span>
                          </div>
                          <p className="text-xs text-gray-600">{c.texto}</p>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Textarea
                      rows={2}
                      placeholder="Adicionar comentário..."
                      value={comentario}
                      onChange={(e) => setComentario(e.target.value)}
                      className="text-sm resize-none"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleEnviarComentario()
                      }}
                    />
                    <Button
                      size="icon"
                      className="shrink-0 bg-[#253B29] hover:bg-[#1a2b1e] self-end"
                      onClick={handleEnviarComentario}
                      disabled={!comentario.trim() || comentarPT.isPending || comentarLT.isPending}
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-100 flex justify-between items-center shrink-0 bg-white">
            <Button variant="outline" size="sm" onClick={handleNavegar} className="gap-1.5 text-xs">
              <ArrowUpRight className="h-3.5 w-3.5" />
              {fonte === 'processo' ? 'Ver processo' : 'Ver lead'}
            </Button>

            <Button
              size="sm"
              onClick={handleConcluir}
              disabled={concluirPT.isPending}
              className={cn(
                'gap-1.5 text-xs',
                tarefa?.concluida
                  ? 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200'
                  : 'bg-[#253B29] hover:bg-[#1a2b1e] text-white'
              )}
            >
              {tarefa?.concluida ? (
                <><Circle className="h-3.5 w-3.5" /> Reabrir</>
              ) : (
                <><CheckCircle2 className="h-3.5 w-3.5" /> Concluir</>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de edição */}
      {tarefa && editando && (
        <TarefaFormModal
          aberto={editando}
          onFechar={() => setEditando(false)}
          onSalvar={handleSalvarEdicao}
          isPending={editarPT.isPending}
          tarefaAtual={{
            titulo:          tarefa.titulo,
            descricao:       tarefa.descricao,
            categoria:       tarefa.categoria,
            prioridade:      tarefa.prioridade,
            responsavel_id:  tarefa.responsavel_id,
            data_prazo:      tarefa.data_prazo,
            horario_inicio:  tarefa.horario_inicio,
            horario_termino: tarefa.horario_termino,
          }}
        />
      )}
    </>
  )
}
