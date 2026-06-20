'use client'

import { useState } from 'react'
import {
  useLeadTarefas, useCriarLeadTarefa, useEditarLeadTarefa,
  useConcluirLeadTarefa, useExcluirLeadTarefa,
  useLeadTarefaComentarios, useComentarLeadTarefa,
  type LeadTarefa,
} from '@/hooks/leads/useLeadTarefas'
import { useMembrosAtivos } from '@/hooks/dashboard/useDashboard'
import { TarefaFormModal as TarefaFormShared, type TarefaFormData } from '@/components/tarefas/TarefaFormModal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { format, isPast, isToday } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  Plus, CalendarClock, CheckCircle2, Circle, AlertCircle,
  Loader2, Pencil, Trash2, MessageSquare, Send, Clock,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const PRIORIDADE_CONFIG = {
  baixa:   { label: 'Baixa',   cor: 'bg-gray-100 text-gray-500' },
  media:   { label: 'Média',   cor: 'bg-blue-100 text-blue-600' },
  alta:    { label: 'Alta',    cor: 'bg-orange-100 text-orange-600' },
  urgente: { label: 'Urgente', cor: 'bg-red-100 text-red-600' },
}

const CATEGORIAS = ['contato', 'follow-up', 'visita', 'proposta', 'documentos', 'outro']

interface Props { leadId: string }

export function AbaTarefas({ leadId }: Props) {
  const { data: tarefas = [], isLoading } = useLeadTarefas(leadId)
  const concluir = useConcluirLeadTarefa(leadId)
  const excluir  = useExcluirLeadTarefa(leadId)

  const [novaAberta, setNovaAberta]       = useState(false)
  const [editando, setEditando]           = useState<LeadTarefa | null>(null)
  const [confirmando, setConfirmando]     = useState<string | null>(null)
  const [comentariosAbertos, setComentariosAbertos] = useState<Set<string>>(new Set())

  const pendentes  = tarefas.filter(t => !t.concluida)
  const concluidas = tarefas.filter(t =>  t.concluida)

  function toggleComentarios(id: string) {
    setComentariosAbertos(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function handleExcluir(id: string) {
    if (confirmando === id) {
      excluir.mutate(id)
      setConfirmando(null)
    } else {
      setConfirmando(id)
      setTimeout(() => setConfirmando(null), 3000)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500 font-medium">
          {pendentes.length} pendente{pendentes.length !== 1 ? 's' : ''}
          {concluidas.length > 0 && ` · ${concluidas.length} concluída${concluidas.length !== 1 ? 's' : ''}`}
        </p>
        <Button
          size="sm"
          className="h-8 text-xs gap-1.5 bg-fonti-primary hover:bg-fonti-primary-hover text-white"
          onClick={() => setNovaAberta(true)}
        >
          <Plus className="h-3 w-3" />
          Nova Tarefa
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="animate-pulse h-16 bg-gray-100 rounded-xl" />
          ))}
        </div>
      ) : tarefas.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <CalendarClock className="h-8 w-8 text-gray-200 mb-3" />
          <p className="text-sm text-gray-400 font-medium">Nenhuma tarefa criada</p>
          <p className="text-xs text-gray-300 mt-1">Crie tarefas de follow-up para este lead</p>
        </div>
      ) : (
        <div className="space-y-5">
          {pendentes.length > 0 && (
            <div className="space-y-2">
              {pendentes.map((tarefa) => (
                <TarefaCard
                  key={tarefa.id}
                  tarefa={tarefa}
                  comentariosAberto={comentariosAbertos.has(tarefa.id)}
                  confirmandoExclusao={confirmando === tarefa.id}
                  onConcluir={() => concluir.mutate(tarefa.id)}
                  onEditar={() => setEditando(tarefa)}
                  onExcluir={() => handleExcluir(tarefa.id)}
                  onToggleComentarios={() => toggleComentarios(tarefa.id)}
                  concluindo={concluir.isPending}
                />
              ))}
            </div>
          )}

          {concluidas.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Concluídas ({concluidas.length})
              </p>
              <div className="space-y-2 opacity-60">
                {concluidas.map((tarefa) => (
                  <TarefaCard
                    key={tarefa.id}
                    tarefa={tarefa}
                    comentariosAberto={comentariosAbertos.has(tarefa.id)}
                    onToggleComentarios={() => toggleComentarios(tarefa.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <TarefaFormModal
        leadId={leadId}
        aberto={novaAberta}
        onFechar={() => setNovaAberta(false)}
      />

      <TarefaFormModal
        key={editando?.id}
        leadId={leadId}
        aberto={!!editando}
        tarefaAtual={editando ?? undefined}
        onFechar={() => setEditando(null)}
      />
    </div>
  )
}

// ── Card de Tarefa ────────────────────────────────────────

function TarefaCard({
  tarefa, comentariosAberto, confirmandoExclusao,
  onConcluir, onEditar, onExcluir, onToggleComentarios, concluindo,
}: {
  tarefa: LeadTarefa
  comentariosAberto: boolean
  confirmandoExclusao?: boolean
  onConcluir?: () => void
  onEditar?: () => void
  onExcluir?: () => void
  onToggleComentarios?: () => void
  concluindo?: boolean
}) {
  const prioridade = PRIORIDADE_CONFIG[tarefa.prioridade] ?? PRIORIDADE_CONFIG.media

  const dataPrazoCompleta = tarefa.data_prazo
    ? tarefa.horario_termino
      ? new Date(`${tarefa.data_prazo}T${tarefa.horario_termino}`)
      : new Date(tarefa.data_prazo + 'T23:59:59')
    : null

  const vencida = dataPrazoCompleta && !tarefa.concluida && isPast(dataPrazoCompleta)
  const hoje    = tarefa.data_prazo && !tarefa.concluida && isToday(new Date(tarefa.data_prazo + 'T12:00:00'))

  return (
    <div className={cn(
      'border rounded-xl transition-all',
      tarefa.concluida  ? 'border-gray-100 bg-gray-50'
      : vencida         ? 'border-red-200 bg-red-50'
      : hoje            ? 'border-orange-200 bg-orange-50/40'
      :                   'border-gray-100 bg-white'
    )}>
      {/* Linha principal */}
      <div className="flex gap-3 p-3">
        {/* Checkbox */}
        <button
          className="shrink-0 mt-0.5 transition-colors disabled:opacity-40"
          onClick={onConcluir}
          disabled={tarefa.concluida || concluindo || !onConcluir}
        >
          {tarefa.concluida
            ? <CheckCircle2 className="h-5 w-5 text-green-500" />
            : concluindo
              ? <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
              : <Circle className="h-5 w-5 text-gray-300 hover:text-fonti-primary" />
          }
        </button>

        {/* Conteúdo */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className={cn(
              'text-sm font-medium leading-snug',
              tarefa.concluida ? 'line-through text-gray-400' : 'text-gray-800'
            )}>
              {tarefa.titulo}
            </p>
            <span className={cn('text-xs px-2 py-0.5 rounded-full shrink-0 font-medium', prioridade.cor)}>
              {prioridade.label}
            </span>
          </div>

          {tarefa.descricao && (
            <p className="text-xs text-gray-500 mt-0.5 leading-snug line-clamp-2">{tarefa.descricao}</p>
          )}

          {/* Meta: data, horário, responsável */}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {tarefa.data_prazo && (
              <span className={cn(
                'flex items-center gap-1 text-xs',
                vencida ? 'text-red-500 font-medium'
                : hoje  ? 'text-orange-600 font-medium'
                :         'text-gray-400'
              )}>
                {vencida && <AlertCircle className="h-3 w-3" />}
                {format(new Date(tarefa.data_prazo + 'T12:00:00'), "dd/MM/yyyy", { locale: ptBR })}
                {(tarefa.horario_inicio || tarefa.horario_termino) && (
                  <span className="flex items-center gap-0.5 ml-1">
                    <Clock className="h-3 w-3" />
                    {tarefa.horario_inicio && tarefa.horario_inicio.slice(0, 5)}
                    {tarefa.horario_inicio && tarefa.horario_termino && '–'}
                    {tarefa.horario_termino && tarefa.horario_termino.slice(0, 5)}
                  </span>
                )}
                {hoje && !vencida && ' · Hoje'}
                {vencida && ' · Vencida'}
              </span>
            )}
            {tarefa.responsavel?.nome && (
              <span className="text-xs text-gray-400">· {tarefa.responsavel.nome}</span>
            )}
          </div>
        </div>

        {/* Ações */}
        {!tarefa.concluida && (
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              onClick={onToggleComentarios}
              title="Comentários"
              className={cn(
                'p-1.5 rounded-lg transition-colors',
                comentariosAberto
                  ? 'bg-fonti-primary text-white'
                  : 'text-gray-400 hover:text-fonti-primary hover:bg-gray-100'
              )}
            >
              <MessageSquare className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onEditar}
              title="Editar"
              className="p-1.5 rounded-lg text-gray-400 hover:text-fonti-primary hover:bg-gray-100 transition-colors"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onExcluir}
              title={confirmandoExclusao ? 'Clique novamente para confirmar' : 'Excluir'}
              className={cn(
                'p-1.5 rounded-lg transition-colors',
                confirmandoExclusao
                  ? 'bg-red-500 text-white'
                  : 'text-gray-400 hover:text-red-500 hover:bg-red-50'
              )}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {tarefa.concluida && onToggleComentarios && (
          <button
            onClick={onToggleComentarios}
            className="p-1.5 rounded-lg text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors shrink-0"
          >
            <MessageSquare className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Seção de comentários expandível */}
      {comentariosAberto && (
        <ComentariosSection tarefaId={tarefa.id} concluida={tarefa.concluida} />
      )}
    </div>
  )
}

// ── Seção de Comentários ──────────────────────────────────

function ComentariosSection({ tarefaId, concluida }: { tarefaId: string; concluida: boolean }) {
  const { data: comentarios = [], isLoading } = useLeadTarefaComentarios(tarefaId)
  const comentar = useComentarLeadTarefa(tarefaId)
  const [texto, setTexto] = useState('')

  async function handleEnviar() {
    const t = texto.trim()
    if (!t) return
    await comentar.mutateAsync(t)
    setTexto('')
  }

  return (
    <div className="border-t border-gray-100 px-4 py-3 bg-gray-50/50 rounded-b-xl space-y-3">
      {/* Lista */}
      {isLoading ? (
        <div className="h-8 bg-gray-100 animate-pulse rounded" />
      ) : comentarios.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-1">Nenhum comentário ainda.</p>
      ) : (
        <div className="space-y-2 max-h-40 overflow-y-auto">
          {comentarios.map((c) => (
            <div key={c.id} className="flex gap-2">
              <div className="w-5 h-5 rounded-full bg-fonti-primary flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-[9px] font-bold text-white">
                  {(c.usuario?.nome ?? 'U').charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5">
                <p className="text-xs font-medium text-gray-500">{c.usuario?.nome}</p>
                <p className="text-xs text-gray-700 whitespace-pre-wrap">{c.texto}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {format(new Date(c.created_at), "dd/MM HH:mm", { locale: ptBR })}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Input — só se não concluída */}
      {!concluida && (
        <div className="flex gap-2">
          <Textarea
            rows={1}
            placeholder="Adicionar comentário..."
            value={texto}
            onChange={e => setTexto(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEnviar() } }}
            className="text-xs resize-none flex-1 min-h-0 py-2"
          />
          <Button
            size="sm"
            className="h-auto px-2.5 bg-fonti-primary hover:bg-fonti-primary-hover text-white self-end"
            onClick={handleEnviar}
            disabled={!texto.trim() || comentar.isPending}
          >
            {comentar.isPending
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Send className="h-3.5 w-3.5" />
            }
          </Button>
        </div>
      )}
    </div>
  )
}

// ── Modal Criar / Editar Tarefa ───────────────────────────

function TarefaFormModal({
  leadId, aberto, tarefaAtual, onFechar,
}: {
  leadId: string
  aberto: boolean
  tarefaAtual?: LeadTarefa
  onFechar: () => void
}) {
  const criar  = useCriarLeadTarefa(leadId)
  const editar = useEditarLeadTarefa(leadId)
  const isPending = criar.isPending || editar.isPending

  async function handleSalvar(dados: TarefaFormData) {
    if (tarefaAtual) {
      await editar.mutateAsync({
        id:              tarefaAtual.id,
        titulo:          dados.titulo,
        descricao:       dados.descricao || undefined,
        categoria:       dados.categoria,
        prioridade:      dados.prioridade as LeadTarefa['prioridade'],
        responsavel_id:  dados.responsavel_id || undefined,
        data_prazo:      dados.data_prazo || undefined,
        horario_inicio:  dados.horario_inicio ?? null,
        horario_termino: dados.horario_termino ?? null,
      })
    } else {
      await criar.mutateAsync({
        titulo:          dados.titulo,
        descricao:       dados.descricao || undefined,
        categoria:       dados.categoria,
        prioridade:      dados.prioridade as LeadTarefa['prioridade'],
        responsavel_id:  dados.responsavel_id || undefined,
        data_prazo:      dados.data_prazo || undefined,
        horario_inicio:  dados.horario_inicio ?? undefined,
        horario_termino: dados.horario_termino ?? undefined,
      })
    }
    onFechar()
  }

  return (
    <TarefaFormShared
      aberto={aberto}
      onFechar={onFechar}
      onSalvar={handleSalvar}
      isPending={isPending}
      tarefaAtual={tarefaAtual}
    />
  )
}
