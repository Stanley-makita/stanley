'use client'

import { useEffect, useState } from 'react'
import { ClipboardCheck, User } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'
import {
  useChecklistTemplate,
  useChecklistExecucoes,
  useMarcarChecklistItem,
} from '@/hooks/processos/useChecklist'
import type { ChecklistItemDB } from '@/hooks/processos/useChecklist'
import { useSalvarValidadeProcesso, LABEL_VALIDADE } from '@/hooks/processos/useSalvarValidadeProcesso'
import type { TipoValidade } from '@/hooks/processos/useSalvarValidadeProcesso'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface Props {
  processoId: string
  faseId: string | null | undefined
  onPendenciasChange: (hasPendencias: boolean) => void
}

function tipoValidadeDeAcao(acao: string | null | undefined): TipoValidade | null {
  if (!acao?.startsWith('salvar_vencimento_')) return null
  const tipo = acao.replace('salvar_vencimento_', '') as TipoValidade
  return ['credito', 'engenharia', 'matricula'].includes(tipo) ? tipo : null
}

export function PainelChecklist({ processoId, faseId, onPendenciasChange }: Props) {
  const { data: tmpl, isLoading: tmplLoading } = useChecklistTemplate(faseId)
  const { data: execucoes = [], isLoading: execLoading } = useChecklistExecucoes(processoId)
  const marcar        = useMarcarChecklistItem(processoId)
  const salvarValidade = useSalvarValidadeProcesso()

  const [itemPendente, setItemPendente] = useState<ChecklistItemDB | null>(null)
  const [dataValidade, setDataValidade] = useState('')

  const itens = tmpl?.itens ?? []
  const marcadosSet = new Set(execucoes.filter(e => e.marcado).map(e => e.item_id))

  const obrigatoriosPendentes = itens.filter(i => i.obrigatorio && !marcadosSet.has(i.id)).length
  const totalObrigatorios     = itens.filter(i => i.obrigatorio).length

  useEffect(() => {
    onPendenciasChange(obrigatoriosPendentes > 0)
  }, [obrigatoriosPendentes, onPendenciasChange])

  const isLoading = tmplLoading || execLoading

  async function handleConfirmarValidade() {
    if (!itemPendente) return
    const tipo = tipoValidadeDeAcao(itemPendente.acao_ao_completar)
    if (!tipo) return

    try {
      if (dataValidade) {
        await salvarValidade.mutateAsync({ processoId, tipo, data: dataValidade })
      }
      marcar.mutate({ item: itemPendente, marcado: true }, {
        onSuccess: () => {
          toast.success(`📅 Validade do ${LABEL_VALIDADE[tipo]} registrada.`)
        },
      })
    } catch {
      toast.error('Erro ao salvar validade.')
    } finally {
      setItemPendente(null)
      setDataValidade('')
    }
  }

  const tipoModal = itemPendente ? tipoValidadeDeAcao(itemPendente.acao_ao_completar) : null

  return (
    <>
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-[#253B29]" />
            <span className="text-sm font-semibold text-[#253B29]">Checklist da fase</span>
          </div>
          {!isLoading && itens.length > 0 && (
            obrigatoriosPendentes > 0 ? (
              <span className="text-xs bg-red-100 text-red-600 font-medium px-1.5 py-0.5 rounded-full">
                {obrigatoriosPendentes}/{totalObrigatorios} pendente{obrigatoriosPendentes > 1 ? 's' : ''}
              </span>
            ) : (
              <span className="text-xs bg-green-100 text-green-600 font-medium px-1.5 py-0.5 rounded-full">
                ✓ Completo
              </span>
            )
          )}
        </div>

        {/* Conteúdo */}
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-6 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : !faseId || itens.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-3">
            {!faseId
              ? 'Processo sem fase definida.'
              : 'Nenhum item configurado para esta fase.'}
          </p>
        ) : (
          <div className="space-y-2">
            {itens.map((item) => {
              const checked = marcadosSet.has(item.id)
              const execucao = execucoes.find(e => e.item_id === item.id && e.marcado)
              const novoMarcado = !checked
              const tipoVal = tipoValidadeDeAcao(item.acao_ao_completar)

              return (
                <div key={item.id} className="group">
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        if (novoMarcado && tipoVal) {
                          setDataValidade('')
                          setItemPendente(item)
                          return
                        }
                        marcar.mutate(
                          { item, marcado: novoMarcado },
                          {
                            onSuccess: async () => {
                              if (novoMarcado && item.acao_ao_completar === 'emitido') {
                                const { default: confetti } = await import('canvas-confetti')
                                confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } })
                                toast.success('🎉 Emissão confirmada! Processo marcado como Emitido.')
                              }
                            },
                          }
                        )
                      }}
                      disabled={marcar.isPending}
                      className="mt-0.5 h-3.5 w-3.5 rounded accent-[#253B29] shrink-0 cursor-pointer"
                    />
                    <span className={`text-xs leading-relaxed flex-1 ${checked ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                      {item.descricao}
                      {item.obrigatorio && (
                        <span className="ml-1 text-red-500 font-bold" title="Obrigatório">*</span>
                      )}
                      {item.acao_ao_completar === 'emitido' && (
                        <span className="ml-1.5 text-[10px] text-green-600 font-medium">🎉 marca como Emitido</span>
                      )}
                      {tipoVal && (
                        <span className="ml-1.5 text-[10px] text-blue-600 font-medium">📅 salva validade da {LABEL_VALIDADE[tipoVal]}</span>
                      )}
                    </span>
                  </label>
                  {execucao?.usuario && execucao.marcado_em && (
                    <p className="text-[10px] text-gray-400 ml-6 mt-0.5 flex items-center gap-1">
                      <User className="h-2.5 w-2.5 shrink-0" />
                      {(execucao.usuario as any).nome} ·{' '}
                      {format(new Date(execucao.marcado_em), "dd/MM 'às' HH:mm", { locale: ptBR })}
                    </p>
                  )}
                </div>
              )
            })}
            <p className="text-[10px] text-gray-400 pt-1">
              <span className="text-red-500">*</span> Obrigatórios para avançar de fase
            </p>
          </div>
        )}
      </div>

      {/* Modal de data de validade */}
      <Dialog open={Boolean(itemPendente)} onOpenChange={(o) => { if (!o) { setItemPendente(null); setDataValidade('') } }}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-[#253B29]">
              📅 Validade — {tipoModal ? LABEL_VALIDADE[tipoModal] : ''}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <p className="text-sm text-gray-600">
              Informe a data de vencimento da validade do {tipoModal ? LABEL_VALIDADE[tipoModal].toLowerCase() : ''}:
            </p>
            <Input
              type="date"
              value={dataValidade}
              onChange={(e) => setDataValidade(e.target.value)}
              className="text-sm"
              autoFocus
            />
            <p className="text-xs text-gray-400">Deixe em branco para marcar o item sem registrar data.</p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => { setItemPendente(null); setDataValidade('') }}>
              Cancelar
            </Button>
            <Button
              size="sm"
              className="bg-[#253B29] hover:bg-[#1a2b1e] text-white"
              disabled={marcar.isPending || salvarValidade.isPending}
              onClick={handleConfirmarValidade}
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
