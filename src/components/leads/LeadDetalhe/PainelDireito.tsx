'use client'

import { useState } from 'react'
import { useLeadHistorico, type LeadTimelineItem } from '@/hooks/leads/useLeadHistorico'
import { useRegistrarInteracao } from '@/hooks/leads/useRegistrarInteracao'
import { useLeadTarefas, useCriarLeadTarefa } from '@/hooks/leads/useLeadTarefas'
import { useLeadChecklist, useCompletarChecklistItem, type ChecklistItemComStatus } from '@/hooks/leads/useLeadChecklist'
import { useFases } from '@/hooks/configuracoes/useFases'
import { useEditarLead } from '@/hooks/leads/useEditarLead'
import { TarefaFormModal, type TarefaFormData } from '@/components/tarefas/TarefaFormModal'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  MessageSquare, Send, CheckCircle2, Circle, Plus,
  ClipboardList, Loader2, ExternalLink,
} from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { cn, normalizarTexto } from '@/lib/utils'
import { toast } from 'sonner'
import type { Lead } from '@/types/leads'

interface Props {
  lead: Lead
}

export function PainelDireitoLead({ lead }: Props) {
  return (
    <div className="h-full flex flex-col overflow-y-auto divide-y divide-gray-200">
      <SecaoNotas leadId={lead.id} />
      <SecaoTarefas leadId={lead.id} />
      <SecaoChecklist leadId={lead.id} faseId={lead.fase_id} />
    </div>
  )
}

// ── Notas ────────────────────────────────────────────────────────────────────

function ListaNotas({ notas }: { notas: LeadTimelineItem[] }) {
  return (
    <div className="space-y-2">
      {notas.map((item) => (
        <div key={item.id} className="flex gap-2">
          <div className="w-5 h-5 rounded-full bg-fonti-primary flex items-center justify-center shrink-0 mt-0.5">
            <MessageSquare className="h-2.5 w-2.5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="bg-white border border-fonti-accent-hover rounded-lg px-2.5 py-1.5">
              <p className="text-xs text-gray-800 whitespace-pre-wrap leading-relaxed">{item.descricao}</p>
            </div>
            <p className="text-[10px] text-gray-400 mt-0.5 ml-0.5">
              <span className="font-medium text-gray-500">{item.usuario?.nome}</span>
              {' · '}
              {formatDistanceToNow(new Date(item.created_at), { addSuffix: true, locale: ptBR })}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}

function SecaoNotas({ leadId }: { leadId: string }) {
  const { data: notas = [] } = useLeadHistorico(leadId, ['comentario'])
  const registrar = useRegistrarInteracao(leadId)
  const [texto, setTexto] = useState('')
  const [dialogAberto, setDialogAberto] = useState(false)

  async function handleEnviar() {
    const nota = texto.trim()
    if (!nota) return
    await registrar.mutateAsync(nota)
    setTexto('')
  }

  return (
    <div className="p-5 space-y-4 shrink-0">
      <div className="flex items-center gap-2 border-b border-gray-100 pb-2.5">
        <MessageSquare className="h-4 w-4 text-fonti-primary" />
        <span className="text-[11px] font-bold text-fonti-primary uppercase tracking-widest">Notas</span>
        {notas.length > 0 && (
          <span className="text-[10px] bg-gray-100 text-gray-500 rounded-full px-1.5 py-0.5 font-medium">{notas.length}</span>
        )}
      </div>

      <div className="bg-fonti-surface-warm rounded-lg border border-fonti-accent-hover p-2.5">
        <Textarea
          placeholder="Registre uma nota..."
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleEnviar() }}
          rows={2}
          className="text-xs resize-none border-0 shadow-none p-0 focus-visible:ring-0 bg-transparent"
        />
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-[9px] text-gray-400">Ctrl+Enter</span>
          <Button
            size="sm"
            className="h-6 text-[10px] gap-1 bg-fonti-primary text-white px-2"
            onClick={handleEnviar}
            disabled={!texto.trim() || registrar.isPending}
          >
            {registrar.isPending ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Send className="h-2.5 w-2.5" />}
            Enviar
          </Button>
        </div>
      </div>

      {notas.length === 0 ? (
        <p className="text-[10px] text-gray-400 text-center py-1">Nenhuma nota ainda</p>
      ) : (
        <>
          <div className="space-y-2 max-h-52 overflow-y-auto pr-0.5">
            <ListaNotas notas={notas.slice(0, 10)} />
          </div>

          <button
            type="button"
            onClick={() => setDialogAberto(true)}
            className="flex items-center gap-1.5 text-xs text-fonti-primary hover:underline"
          >
            <MessageSquare className="h-3 w-3" />
            Ver {notas.length === 1 ? 'a nota' : `todas as ${notas.length} notas`}
          </button>
        </>
      )}

      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent className="max-h-[92svh] w-[calc(100vw-1rem)] max-w-lg overflow-y-auto sm:w-full">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold text-fonti-primary">
              Todas as notas ({notas.length})
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto pr-1">
            <ListaNotas notas={notas} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Tarefas ──────────────────────────────────────────────────────────────────

function SecaoTarefas({ leadId }: { leadId: string }) {
  const { data: tarefas = [] } = useLeadTarefas(leadId)
  const criar = useCriarLeadTarefa(leadId)
  const [novaAberta, setNovaAberta] = useState(false)

  const pendentes = tarefas.filter(t => !t.concluida)
  const concluidas = tarefas.filter(t => t.concluida)

  async function handleCriar(data: TarefaFormData) {
    await criar.mutateAsync({
      ...data,
      horario_inicio: data.horario_inicio ?? undefined,
      horario_termino: data.horario_termino ?? undefined,
    })
    setNovaAberta(false)
  }

  return (
    <div className="p-5 space-y-4 shrink-0">
      <div className="flex items-center justify-between border-b border-gray-100 pb-2.5">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-fonti-primary" />
          <span className="text-[11px] font-bold text-fonti-primary uppercase tracking-widest">Tarefas</span>
          {pendentes.length > 0 && (
            <span className="text-[10px] bg-amber-100 text-amber-600 rounded-full px-1.5 py-0.5 font-medium">{pendentes.length}</span>
          )}
        </div>
        <button
          onClick={() => setNovaAberta(true)}
          className="w-5 h-5 rounded flex items-center justify-center text-gray-400 hover:text-fonti-primary hover:bg-gray-100"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {tarefas.length === 0 ? (
        <p className="text-[10px] text-gray-400 text-center py-1">Nenhuma tarefa</p>
      ) : (
        <div className="space-y-1.5">
          {pendentes.map((t) => (
            <div key={t.id} className="flex items-start gap-2">
              <Circle className="h-3.5 w-3.5 text-gray-300 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-700 truncate">{t.titulo}</p>
                {t.data_prazo && (
                  <p className="text-[10px] text-gray-400">{format(new Date(t.data_prazo), 'dd/MM', { locale: ptBR })}</p>
                )}
              </div>
            </div>
          ))}
          {concluidas.length > 0 && (
            <p className="text-[10px] text-gray-400 pt-0.5">{concluidas.length} concluída{concluidas.length !== 1 ? 's' : ''}</p>
          )}
        </div>
      )}

      <TarefaFormModal
        aberto={novaAberta}
        onFechar={() => setNovaAberta(false)}
        onSalvar={handleCriar}
        isPending={criar.isPending}
      />
    </div>
  )
}

// ── Checklist ────────────────────────────────────────────────────────────────

function SecaoChecklist({ leadId, faseId }: { leadId: string; faseId: string }) {
  const { data: itens = [] } = useLeadChecklist(leadId, faseId)
  const completar = useCompletarChecklistItem()
  const { data: fases = [] } = useFases('leads')
  const editarLead = useEditarLead()
  // Não usar lead.fase?.nome (join) — cruza a lista de fases (sempre
  // populada) com o faseId cru, mesmo padrão de PipelineBarLead.
  const faseAtualNome = fases.find(f => f.id === faseId)?.nome
  const [modalItem, setModalItem] = useState<ChecklistItemComStatus | null>(null)
  const [modalResultado, setModalResultado] = useState('')
  const [modalObs, setModalObs] = useState('')

  async function handleToggle(item: ChecklistItemComStatus, concluido: boolean, resultado?: string, obs?: string) {
    try {
      await completar.mutateAsync({
        lead_id: leadId,
        fase_id: faseId,
        item_id: item.id,
        execucao_id: item.execucao_id,
        concluido,
        resultado: resultado ?? item.resultado,
        observacao: obs ?? item.observacao,
      })
      toast.success(concluido ? 'Item concluído.' : 'Item desmarcado.')

      // Avanço automático: item "Consulta CPF" concluído na fase "Atendimento
      // Iniciado" leva direto para "Documentação" — pedido do usuário
      // 2026-07-13. Casamento por texto (não há um tipo/slug dedicado para
      // este item hoje), mesma convenção já usada em outros pontos do app
      // (ex.: PipelineBarLead compara fase.nome === 'Concluído').
      if (concluido && normalizarTexto(faseAtualNome) === normalizarTexto('Atendimento Iniciado') && item.descricao.toLowerCase().includes('cpf')) {
        const faseDocumentacao = fases.find(f => normalizarTexto(f.nome) === normalizarTexto('Documentação'))
        if (faseDocumentacao) {
          editarLead.mutate(
            { id: leadId, fase_id: faseDocumentacao.id },
            { onSuccess: () => toast.success('Lead avançado para Documentação') }
          )
        }
      }
    } catch {
      toast.error('Erro ao atualizar item.')
    }
  }

  if (itens.length === 0) return null

  const pendentes = itens.filter(i => !i.concluido)

  return (
    <div className="p-5 space-y-4 shrink-0">
      <div className="flex items-center gap-2 border-b border-gray-100 pb-2.5">
        <ClipboardList className="h-4 w-4 text-fonti-primary" />
        <span className="text-[11px] font-bold text-fonti-primary uppercase tracking-widest">Checklist da fase</span>
        {pendentes.length > 0 && (
          <span className="text-[10px] bg-red-100 text-red-600 rounded-full px-1.5 py-0.5 font-medium">{pendentes.length}</span>
        )}
      </div>

      <div className="space-y-1.5">
        {itens.map((item) => (
          <div
            key={item.id}
            className={cn(
              'flex items-start gap-2 px-2 py-1.5 rounded-lg border',
              item.concluido
                ? 'bg-gray-50 border-gray-100'
                : item.bloqueia_avanco
                  ? 'bg-red-50/50 border-red-200'
                  : item.obrigatorio
                    ? 'bg-amber-50/40 border-amber-200'
                    : 'bg-white border-gray-100'
            )}
          >
            <button
              disabled={completar.isPending}
              className="mt-0.5 shrink-0"
              onClick={() => {
                if (!item.concluido && item.tipo === 'restritivos') {
                  setModalItem(item)
                  setModalResultado(item.resultado ?? '')
                  setModalObs(item.observacao ?? '')
                } else {
                  handleToggle(item, !item.concluido)
                }
              }}
            >
              {item.concluido
                ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                : <Circle className="h-3.5 w-3.5 text-gray-300 hover:text-gray-400" />
              }
            </button>
            <div className="flex-1 min-w-0">
              <span className={cn('text-[11px]', item.concluido && 'line-through text-gray-400')}>
                {item.descricao}
              </span>
              <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                {item.bloqueia_avanco && !item.concluido && (
                  <span className="text-[9px] text-red-600 font-semibold bg-red-100 px-1 rounded">Bloqueia avanço</span>
                )}
                {item.link_externo && !item.concluido && (
                  <a
                    href={item.link_externo}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[9px] text-blue-500 flex items-center gap-0.5 hover:underline"
                    onClick={e => e.stopPropagation()}
                  >
                    <ExternalLink className="h-2.5 w-2.5" /> Link
                  </a>
                )}
                {item.resultado && (
                  <span className={cn(
                    'text-[9px] font-medium px-1 py-0.5 rounded',
                    item.resultado === 'sem_restritivos' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                  )}>
                    {item.resultado === 'sem_restritivos' ? 'Sem restritivos' : 'Com restritivos'}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={!!modalItem} onOpenChange={() => setModalItem(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Consulta de Restritivos</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-xs text-gray-700">{modalItem?.descricao}</p>
            <div className="flex gap-2">
              {[
                { value: 'sem_restritivos', label: 'Sem restritivos', cls: 'border-green-300 text-green-700 bg-green-50' },
                { value: 'com_restritivos', label: 'Com restritivos', cls: 'border-amber-300 text-amber-700 bg-amber-50' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setModalResultado(opt.value)}
                  className={cn(
                    'flex-1 py-2 px-3 rounded-lg border text-xs font-medium transition-all',
                    modalResultado === opt.value
                      ? cn(opt.cls, 'ring-2 ring-offset-1 ring-current')
                      : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Observação (opcional)</Label>
              <Textarea value={modalObs} onChange={e => setModalObs(e.target.value)} rows={2} className="text-xs" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setModalItem(null)}>Cancelar</Button>
            <Button
              size="sm"
              className="bg-fonti-primary text-white"
              disabled={completar.isPending}
              onClick={async () => {
                if (!modalItem) return
                if (modalItem.tipo === 'restritivos' && !modalResultado) {
                  toast.error('Selecione o resultado da consulta.')
                  return
                }
                await handleToggle(modalItem, true, modalResultado || undefined, modalObs || undefined)
                setModalItem(null)
              }}
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
