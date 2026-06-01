'use client'

import { useState } from 'react'
import { useAuth } from '@/hooks/auth/useAuth'
import { useFases } from '@/hooks/configuracoes/useFases'
import { useProcessoFasesHistorico, useAvancarFase } from '@/hooks/processos/useProcessoFasesHistorico'
import { useEnviarParaRegistro } from '@/hooks/processos/useEnviarParaRegistro'
import { type Processo, type ModalidadeProcesso } from '@/types/processos'
import { type Fase } from '@/types/configuracoes'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Check, ChevronRight, AlertTriangle } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { usePermissao } from '@/hooks/auth/usePermissao'

// ─── Modalidades de financiamento que disparam criação de Registro ────────────

const FINANCIAMENTO_MODALIDADES = new Set<ModalidadeProcesso>(['SFI', 'SBPE', 'PMCMV', 'Pro_Cotista', 'CGI'])

// ─── Mapeamento modalidade → módulo de fases ──────────────────────────────────

const MODULO_POR_MODALIDADE: Record<ModalidadeProcesso, string> = {
  SFI:         'processos',
  SBPE:        'processos',
  PMCMV:       'processos',
  Pro_Cotista: 'processos',
  CGI:         'processos',
  Consorcio:   'consorcio',
  Contrato:    'contrato',
  Registro:    'registro',
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  processoId: string
  processo: Processo
  itensObrigatoriosPendentes?: boolean
}

// ─── Stepper ─────────────────────────────────────────────────────────────────

function StepperFases({
  fases,
  faseAtualId,
  faseAtualIndex,
  podeEditar,
  onVoltar,
}: {
  fases: Fase[]
  faseAtualId: string | null
  faseAtualIndex: number
  podeEditar: boolean
  onVoltar: (fase: Fase) => void
}) {
  if (fases.length === 0) return (
    <p className="text-sm text-gray-400 py-4 text-center">
      Nenhuma fase cadastrada para este tipo de processo.
      Configure em <strong>Configurações → Fases</strong>.
    </p>
  )

  return (
    <div className="overflow-x-auto pb-1">
      <div className="flex items-start min-w-max gap-0">
        {fases.map((fase, idx) => {
          const isConcluida = faseAtualIndex >= 0 && idx < faseAtualIndex
          const isAtual     = fase.id === faseAtualId
          const isFutura    = !isConcluida && !isAtual
          const isLast      = idx === fases.length - 1
          const cor         = fase.cor ?? '#C2AA6A'

          return (
            <div key={fase.id} className="flex items-start">
              {/* Passo */}
              <div className="flex flex-col items-center w-24">
                {/* Círculo */}
                <button
                  type="button"
                  disabled={!podeEditar || !isConcluida}
                  onClick={() => podeEditar && isConcluida && onVoltar(fase)}
                  className={`w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all
                    ${isConcluida
                      ? 'bg-[#253B29] border-[#253B29] cursor-pointer hover:opacity-80'
                      : isAtual
                        ? 'border-[#C2AA6A] bg-[#C2AA6A] cursor-default shadow-[0_0_0_3px_#C2AA6A30]'
                        : 'bg-white border-gray-300 cursor-default'
                    }`}
                  title={isConcluida && podeEditar ? `Retornar para "${fase.nome}"` : undefined}
                >
                  {isConcluida
                    ? <Check className="h-4 w-4 text-white" />
                    : isAtual
                      ? <div className="w-2.5 h-2.5 rounded-full bg-white" />
                      : <div className="w-2 h-2 rounded-full bg-gray-300" />
                  }
                </button>

                {/* Label */}
                <p className={`text-center mt-1.5 leading-tight px-1 ${
                  isAtual    ? 'text-[11px] font-bold text-[#253B29]'
                  : isConcluida ? 'text-[10px] text-gray-500'
                  : 'text-[10px] text-gray-400'
                }`}
                  style={{ maxWidth: '88px', wordBreak: 'break-word' }}>
                  {fase.nome}
                </p>

                {isAtual && (
                  <span className="mt-1 text-[9px] font-semibold bg-[#C2AA6A] text-[#253B29] px-1.5 py-0.5 rounded-full">
                    atual
                  </span>
                )}
              </div>

              {/* Conector */}
              {!isLast && (
                <div className={`w-8 h-0.5 mt-4 shrink-0 ${
                  isConcluida ? 'bg-[#253B29]'
                  : isAtual    ? 'bg-gradient-to-r from-[#C2AA6A] to-gray-200'
                  : 'border-t border-dashed border-gray-300 bg-transparent h-0'
                }`} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function AbaFases({ processoId, processo, itensObrigatoriosPendentes = false }: Props) {
  useAuth()
  const { pode } = usePermissao()
  const { data: historico = [], isLoading } = useProcessoFasesHistorico(processoId)
  const avancarFase = useAvancarFase(processoId)
  const enviarParaRegistro = useEnviarParaRegistro()

  const modulo = MODULO_POR_MODALIDADE[processo.modalidade] ?? 'processos'
  const { data: fases = [], isLoading: fasesLoading } = useFases(modulo)

  // Fase atual
  const faseAtualIndex = fases.findIndex((f) => f.id === processo.fase_atual_id)

  // Próxima fase (sequencial por índice, independente do valor numérico de ordem)
  const proximaFase = fases.length > 0
    ? processo.fase_atual_id === null
      ? fases[0]
      : faseAtualIndex >= 0 && faseAtualIndex < fases.length - 1
        ? fases[faseAtualIndex + 1]
        : null
    : null

  // Estado: dialog de retorno
  const [voltarParaFase, setVoltarParaFase] = useState<Fase | null>(null)
  const [motivo, setMotivo] = useState('')
  const [salvando, setSalvando] = useState(false)

  const podeEditar = pode('processos.editar')

  async function handleAvancar() {
    if (!proximaFase) return
    await avancarFase.mutateAsync({ faseId: proximaFase.id })

    if (
      proximaFase.nome.trim().toLowerCase() === 'emitido' &&
      FINANCIAMENTO_MODALIDADES.has(processo.modalidade)
    ) {
      enviarParaRegistro.mutate(processo)
    }
  }

  async function handleConfirmarRetorno() {
    if (!voltarParaFase || !motivo.trim()) return
    setSalvando(true)
    try {
      await avancarFase.mutateAsync({ faseId: voltarParaFase.id, observacao: motivo.trim() })
      setVoltarParaFase(null)
      setMotivo('')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="space-y-6">

      {/* ── Stepper ── */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        {fasesLoading
          ? <div className="h-16 bg-gray-100 animate-pulse rounded-lg" />
          : (
            <StepperFases
              fases={fases}
              faseAtualId={processo.fase_atual_id}
              faseAtualIndex={faseAtualIndex}
              podeEditar={podeEditar}
              onVoltar={(fase) => { setVoltarParaFase(fase); setMotivo('') }}
            />
          )
        }
      </div>

      {/* ── Botão avançar ── */}
      {podeEditar && (
        <div className="flex items-center justify-between">
          {proximaFase ? (
            <div className="space-y-1.5">
              <Button
                className="bg-[#253B29] hover:bg-[#1a2b1e] text-white gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleAvancar}
                disabled={avancarFase.isPending || itensObrigatoriosPendentes}
              >
                <ChevronRight className="h-4 w-4" />
                Avançar para <strong className="ml-0.5">{proximaFase.nome}</strong>
              </Button>
              {itensObrigatoriosPendentes && (
                <p className="text-xs text-red-500 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  Complete os itens obrigatórios do checklist antes de avançar.
                </p>
              )}
            </div>
          ) : fases.length > 0 ? (
            <p className="text-sm text-green-700 font-medium flex items-center gap-1.5">
              <Check className="h-4 w-4" /> Todas as fases concluídas
            </p>
          ) : null}
          {podeEditar && faseAtualIndex >= 0 && (
            <p className="text-xs text-gray-400">
              Clique em uma fase anterior no stepper para retornar
            </p>
          )}
        </div>
      )}

      {/* ── Histórico ── */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Histórico</p>
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => <div key={i} className="h-14 bg-gray-100 animate-pulse rounded-xl" />)}
          </div>
        ) : historico.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">Nenhuma movimentação registrada.</p>
        ) : (
          <div className="relative">
            <div className="absolute left-4 top-4 bottom-4 w-px bg-gray-200" />
            <div className="space-y-3">
              {historico.map((item, idx) => {
                const isCurrent = processo.fase_atual_id === item.fase_id
                const cor = item.fase?.cor ?? '#C2AA6A'
                return (
                  <div key={item.id} className="relative flex gap-4 pl-10">
                    <div
                      className="absolute left-2.5 -translate-x-1/2 w-4 h-4 rounded-full border-2 border-white"
                      style={{ backgroundColor: cor }}
                    />
                    <div className={`flex-1 rounded-xl p-3 border text-xs ${
                      isCurrent ? 'border-[#C2AA6A] bg-[#E7E0C4]/20' : 'border-gray-100 bg-white'
                    }`}>
                      <div className="flex items-center justify-between mb-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-[#253B29]">{item.fase?.nome ?? '—'}</span>
                          {isCurrent && (
                            <span className="bg-[#253B29] text-white text-[9px] px-1.5 py-0.5 rounded-full">Atual</span>
                          )}
                        </div>
                        <span className="text-gray-400">
                          {formatDistanceToNow(new Date(item.entrou_em), { addSuffix: true, locale: ptBR })}
                        </span>
                      </div>
                      <p className="text-gray-400">
                        por {item.usuario?.nome ?? 'Sistema'} · {new Date(item.entrou_em).toLocaleDateString('pt-BR', {
                          day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
                        })}
                      </p>
                      {item.observacao && (
                        <p className="text-gray-600 mt-1.5 bg-gray-50 rounded-lg p-2">{item.observacao}</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Dialog retorno de fase ── */}
      <Dialog open={!!voltarParaFase} onOpenChange={(open) => { if (!open) { setVoltarParaFase(null); setMotivo('') } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700">
              <AlertTriangle className="h-5 w-5" />
              Retornar para "{voltarParaFase?.nome}"?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-500">
            O processo retornará para uma fase anterior. Esta ação fica registrada no histórico.
          </p>
          <div className="space-y-1.5">
            <Label>Motivo <span className="text-red-500">*</span></Label>
            <Textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Descreva o motivo do retorno..."
              rows={3}
              className="resize-none"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setVoltarParaFase(null); setMotivo('') }}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={!motivo.trim() || salvando}
              onClick={handleConfirmarRetorno}
            >
              {salvando ? 'Salvando...' : 'Confirmar retorno'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}
