'use client'

import { useEffect, useState } from 'react'
import { ClipboardCheck, User } from 'lucide-react'
import { format, addDays } from 'date-fns'
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
import { useSalvarEngenharia } from '@/hooks/processos/useSalvarEngenharia'
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
  const marcar          = useMarcarChecklistItem(processoId)
  const salvarValidade  = useSalvarValidadeProcesso()
  const salvarEngenharia = useSalvarEngenharia()

  const [itemPendente, setItemPendente] = useState<ChecklistItemDB | null>(null)
  const [dataValidade, setDataValidade] = useState('')

  // Estado para o modal de engenharia (2 campos)
  const [itemPendenteEng, setItemPendenteEng] = useState<ChecklistItemDB | null>(null)
  const [dataEngenharia, setDataEngenharia]   = useState('')
  const [valorEngenharia, setValorEngenharia] = useState('')

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
      <div className="p-5 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 pb-2.5">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-fonti-primary" />
            <span className="text-[11px] font-bold text-fonti-primary uppercase tracking-widest">Checklist da fase</span>
          </div>
          {!isLoading && itens.length > 0 && (
            obrigatoriosPendentes > 0 ? (
              <span className="text-xs bg-red-100 text-red-600 font-medium px-1.5 py-0.5 rounded-full">
                {obrigatoriosPendentes}/{totalObrigatorios} pend.
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
                        if (novoMarcado && item.acao_ao_completar === 'salvar_engenharia') {
                          setDataEngenharia('')
                          setValorEngenharia('')
                          setItemPendenteEng(item)
                          return
                        }
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
                      className="mt-0.5 h-3.5 w-3.5 rounded accent-fonti-primary shrink-0 cursor-pointer"
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
                      {item.acao_ao_completar === 'salvar_engenharia' && (
                        <span className="ml-1.5 text-[10px] text-purple-600 font-medium">📐 salva vencimento + valor engenharia</span>
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
        <DialogContent className="max-h-[92svh] w-[calc(100vw-1rem)] max-w-xs overflow-y-auto sm:w-full">
          <DialogHeader>
            <DialogTitle className="text-fonti-primary">
              📅 Validade — {tipoModal ? LABEL_VALIDADE[tipoModal] : ''}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <p className="text-sm text-gray-600">
              Informe a data de vencimento da validade do {tipoModal ? LABEL_VALIDADE[tipoModal].toLowerCase() : ''}:
            </p>
            {tipoModal === 'matricula' && (
              <button
                type="button"
                onClick={() => setDataValidade(format(addDays(new Date(), 30), 'yyyy-MM-dd'))}
                className="text-xs bg-fonti-accent-hover/60 hover:bg-fonti-accent-hover text-fonti-primary font-medium px-3 py-1.5 rounded-lg transition-colors"
              >
                + 30 dias (padrão matrícula nova)
              </button>
            )}
            {tipoModal === 'engenharia' && (
              <button
                type="button"
                onClick={() => setDataValidade(format(addDays(new Date(), 180), 'yyyy-MM-dd'))}
                className="text-xs bg-fonti-accent-hover/60 hover:bg-fonti-accent-hover text-fonti-primary font-medium px-3 py-1.5 rounded-lg transition-colors"
              >
                + 180 dias (prazo padrão engenharia)
              </button>
            )}
            <Input
              type="date"
              value={dataValidade}
              onChange={(e) => setDataValidade(e.target.value)}
              className="text-sm"
              autoFocus
            />
            <p className="text-xs text-gray-400">Deixe em branco para marcar o item sem registrar data.</p>
          </div>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button variant="outline" size="sm" onClick={() => { setItemPendente(null); setDataValidade('') }} className="w-full sm:w-auto">
              Cancelar
            </Button>
            <Button
              size="sm"
              className="w-full bg-fonti-primary text-white hover:bg-fonti-primary-hover sm:w-auto"
              disabled={marcar.isPending || salvarValidade.isPending}
              onClick={handleConfirmarValidade}
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de engenharia: vencimento + valor (ambos obrigatórios) */}
      <Dialog
        open={Boolean(itemPendenteEng)}
        onOpenChange={(o) => { if (!o) { setItemPendenteEng(null); setDataEngenharia(''); setValorEngenharia('') } }}
      >
        <DialogContent className="max-h-[92svh] w-[calc(100vw-1rem)] max-w-xs overflow-y-auto sm:w-full">
          <DialogHeader>
            <DialogTitle className="text-fonti-primary">📐 Engenharia Realizada</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">Vencimento da engenharia <span className="text-red-500">*</span></label>
              <button
                type="button"
                onClick={() => setDataEngenharia(format(addDays(new Date(), 180), 'yyyy-MM-dd'))}
                className="text-xs bg-fonti-accent-hover/60 hover:bg-fonti-accent-hover text-fonti-primary font-medium px-3 py-1.5 rounded-lg transition-colors block"
              >
                + 180 dias (prazo padrão)
              </button>
              <Input
                type="date"
                value={dataEngenharia}
                onChange={(e) => setDataEngenharia(e.target.value)}
                className="text-sm"
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">Valor avaliado pelo banco (R$) <span className="text-red-500">*</span></label>
              <Input
                type="number"
                min="0"
                step="1000"
                placeholder="Ex: 350000"
                value={valorEngenharia}
                onChange={(e) => setValorEngenharia(e.target.value)}
                className="text-sm"
              />
            </div>
          </div>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button variant="outline" size="sm" onClick={() => { setItemPendenteEng(null); setDataEngenharia(''); setValorEngenharia('') }} className="w-full sm:w-auto">
              Cancelar
            </Button>
            <Button
              size="sm"
              className="w-full bg-fonti-primary text-white hover:bg-fonti-primary-hover sm:w-auto"
              disabled={marcar.isPending || salvarEngenharia.isPending || !dataEngenharia || !valorEngenharia}
              onClick={async () => {
                if (!itemPendenteEng || !dataEngenharia || !valorEngenharia) return
                const valor = parseFloat(valorEngenharia.replace(/\./g, '').replace(',', '.'))
                if (isNaN(valor) || valor <= 0) return
                try {
                  await salvarEngenharia.mutateAsync({ processoId, validadeEngenharia: dataEngenharia, valorEngenharia: valor })
                  marcar.mutate({ item: itemPendenteEng, marcado: true }, {
                    onSuccess: () => toast.success('📐 Engenharia registrada com sucesso.'),
                  })
                } catch {
                  toast.error('Erro ao salvar dados de engenharia.')
                } finally {
                  setItemPendenteEng(null)
                  setDataEngenharia('')
                  setValorEngenharia('')
                }
              }}
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
