'use client'

import { useState } from 'react'
import { CheckCircle2, Circle, AlertCircle, ExternalLink, Clock, Search, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { useLeadChecklist, useCompletarChecklistItem, type ChecklistItemComStatus } from '@/hooks/leads/useLeadChecklist'
import { TIPOS_CHECKLIST, type TipoChecklistItem } from '@/app/(protected)/configuracoes/_hooks/useFaseChecklists'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { Lead } from '@/types/leads'
import { cn } from '@/lib/utils'

interface Props {
  lead: Lead
}

export function AbaOperacional({ lead }: Props) {
  const { data: itens = [], isLoading } = useLeadChecklist(lead.id, lead.fase_id)
  const completar = useCompletarChecklistItem()

  const [modalItem, setModalItem] = useState<ChecklistItemComStatus | null>(null)
  const [modalObs, setModalObs] = useState('')
  const [modalResultado, setModalResultado] = useState<string>('')

  const pendentes = itens.filter((i) => !i.concluido)
  const concluidos = itens.filter((i) => i.concluido)
  const temBloqueio = pendentes.some((i) => i.bloqueia_avanco)

  function abrirModal(item: ChecklistItemComStatus) {
    setModalItem(item)
    setModalObs(item.observacao ?? '')
    setModalResultado(item.resultado ?? '')
  }

  async function handleToggle(item: ChecklistItemComStatus, concluido: boolean, resultado?: string, observacao?: string) {
    try {
      await completar.mutateAsync({
        lead_id:     lead.id,
        fase_id:     lead.fase_id,
        item_id:     item.id,
        execucao_id: item.execucao_id,
        concluido,
        resultado:   resultado ?? item.resultado,
        observacao:  observacao ?? item.observacao,
      })
      toast.success(concluido ? 'Item concluído.' : 'Item desmarcado.')
    } catch {
      toast.error('Erro ao atualizar item.')
    }
  }

  async function handleConfirmarModal() {
    if (!modalItem) return
    if (modalItem.tipo === 'restritivos' && !modalResultado) {
      toast.error('Selecione o resultado da consulta de restritivos.')
      return
    }
    await handleToggle(modalItem, true, modalResultado || undefined, modalObs || undefined)
    setModalItem(null)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    )
  }

  if (itens.length === 0) {
    return (
      <div className="text-center py-12 space-y-2">
        <p className="text-sm text-gray-500">Nenhum item de checklist configurado para esta fase.</p>
        <a href="/configuracoes" className="text-xs text-[#C2AA6A] hover:underline">
          Configurar em Configurações → Fases
        </a>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Alerta de bloqueio */}
      {temBloqueio && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>Há itens obrigatórios que bloqueiam o avanço de fase. Conclua-os antes de avançar.</span>
        </div>
      )}

      {/* Itens pendentes */}
      {pendentes.length > 0 && (
        <section className="space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Pendentes ({pendentes.length})
          </p>
          {pendentes.map((item) => (
            <ChecklistRow
              key={item.id}
              item={item}
              onToggle={(concluido) => {
                if (concluido && (item.tipo === 'restritivos' || item.observacao !== null)) {
                  abrirModal(item)
                } else {
                  handleToggle(item, concluido)
                }
              }}
              onAbrirModal={() => abrirModal(item)}
              loading={completar.isPending}
            />
          ))}
        </section>
      )}

      {/* Itens concluídos */}
      {concluidos.length > 0 && (
        <section className="space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Concluídos ({concluidos.length})
          </p>
          {concluidos.map((item) => (
            <ChecklistRow
              key={item.id}
              item={item}
              onToggle={(concluido) => handleToggle(item, concluido)}
              onAbrirModal={() => abrirModal(item)}
              loading={completar.isPending}
            />
          ))}
        </section>
      )}

      {/* Modal para itens com resultado / restritivos */}
      <Dialog open={!!modalItem} onOpenChange={() => setModalItem(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">
              {modalItem?.tipo === 'restritivos' ? 'Consulta de Restritivos' : 'Concluir item'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <p className="text-sm text-gray-700">{modalItem?.descricao}</p>

            {modalItem?.tipo === 'restritivos' && (
              <div className="space-y-2">
                <Label className="text-xs font-medium">Resultado da consulta *</Label>
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
                        'flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-all',
                        modalResultado === opt.value
                          ? cn(opt.cls, 'ring-2 ring-offset-1 ring-current')
                          : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-400">
                  Obrigatório informar, mas não impede o avanço de fase.
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Observação (opcional)</Label>
              <Textarea
                value={modalObs}
                onChange={(e) => setModalObs(e.target.value)}
                placeholder="Detalhe relevante..."
                rows={3}
                className="text-sm"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setModalItem(null)}>Cancelar</Button>
            <Button
              size="sm"
              className="bg-[#253B29] text-white"
              onClick={handleConfirmarModal}
              disabled={completar.isPending}
            >
              {completar.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── ChecklistRow ──────────────────────────────────────────────

const TIPO_ICONE: Record<TipoChecklistItem, React.ReactNode> = {
  manual:       <CheckCircle2 className="w-4 h-4 text-gray-400" />,
  restritivos:  <Search className="w-4 h-4 text-blue-400" />,
  documento:    <AlertCircle className="w-4 h-4 text-amber-400" />,
  formulario:   <AlertCircle className="w-4 h-4 text-purple-400" />,
  link_externo: <ExternalLink className="w-4 h-4 text-teal-400" />,
}

function ChecklistRow({
  item,
  onToggle,
  onAbrirModal,
  loading,
}: {
  item: ChecklistItemComStatus
  onToggle: (concluido: boolean) => void
  onAbrirModal: () => void
  loading: boolean
}) {
  const precisaModal = item.tipo === 'restritivos'

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-3 rounded-lg border transition-all',
        item.concluido
          ? 'bg-gray-50 border-gray-100'
          : item.obrigatorio
            ? 'bg-amber-50/40 border-amber-200'
            : 'bg-white border-gray-100 hover:border-gray-200'
      )}
    >
      {/* Checkbox */}
      <button
        className="mt-0.5 shrink-0 disabled:opacity-50"
        disabled={loading}
        onClick={() => {
          if (!item.concluido && precisaModal) {
            onAbrirModal()
          } else {
            onToggle(!item.concluido)
          }
        }}
      >
        {item.concluido
          ? <CheckCircle2 className="w-5 h-5 text-green-500" />
          : <Circle className="w-5 h-5 text-gray-300 hover:text-gray-400" />
        }
      </button>

      {/* Conteúdo */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={cn('text-sm', item.concluido && 'line-through text-gray-400')}>
            {item.descricao}
          </span>
          {item.obrigatorio && !item.concluido && (
            <span className="text-[10px] text-amber-600 font-semibold bg-amber-100 px-1.5 py-0.5 rounded">
              Obrigatório
            </span>
          )}
          {item.bloqueia_avanco && !item.concluido && (
            <span className="text-[10px] text-red-600 font-semibold bg-red-100 px-1.5 py-0.5 rounded">
              Bloqueia avanço
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-[10px] text-gray-400">{TIPOS_CHECKLIST[item.tipo]}</span>

          {item.resultado && (
            <span className={cn(
              'text-[10px] font-medium px-1.5 py-0.5 rounded',
              item.resultado === 'sem_restritivos'
                ? 'bg-green-100 text-green-700'
                : 'bg-amber-100 text-amber-700'
            )}>
              {item.resultado === 'sem_restritivos' ? 'Sem restritivos' : 'Com restritivos'}
            </span>
          )}

          {item.link_externo && !item.concluido && (
            <a
              href={item.link_externo}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-blue-500 flex items-center gap-0.5 hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="w-3 h-3" /> Abrir link
            </a>
          )}
        </div>

        {item.concluido && (item.concluido_por_nome || item.concluido_at) && (
          <div className="flex items-center gap-1 mt-1 text-[10px] text-gray-400">
            <Clock className="w-3 h-3" />
            {item.concluido_por_nome && <span>{item.concluido_por_nome}</span>}
            {item.concluido_at && (
              <span>
                {format(new Date(item.concluido_at), "dd/MM/yy 'às' HH:mm", { locale: ptBR })}
              </span>
            )}
          </div>
        )}

        {item.observacao && (
          <p className="text-[10px] text-gray-500 mt-1 italic">{item.observacao}</p>
        )}
      </div>
    </div>
  )
}
