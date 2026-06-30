'use client'

import { useState } from 'react'
import { useEditarLead } from '@/hooks/leads/useEditarLead'
import { useLeadChecklist } from '@/hooks/leads/useLeadChecklist'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import type { Lead } from '@/types/leads'
import type { Fase } from '@/types/configuracoes'

interface Props {
  lead: Lead
  fases: Fase[]
  onConcluido?: () => void
}

const ARROW_SIZE = 14 // px — tamanho da seta lateral

/** Retorna o clip-path correto de acordo com a posição na barra */
function clipPath(isFirst: boolean, isLast: boolean) {
  if (isFirst) {
    return `polygon(0 0, calc(100% - ${ARROW_SIZE}px) 0, 100% 50%, calc(100% - ${ARROW_SIZE}px) 100%, 0 100%)`
  }
  if (isLast) {
    return `polygon(${ARROW_SIZE}px 0, 100% 0, 100% 100%, 0 100%, ${ARROW_SIZE}px 50%)`
  }
  return `polygon(${ARROW_SIZE}px 0, calc(100% - ${ARROW_SIZE}px) 0, 100% 50%, calc(100% - ${ARROW_SIZE}px) 100%, 0 100%, ${ARROW_SIZE}px 50%)`
}

export function PipelineBarLead({ lead, fases, onConcluido }: Props) {
  const [fasePendente, setFasePendente] = useState<Fase | null>(null)
  const editarLead = useEditarLead()
  const { data: itensChecklist = [] } = useLeadChecklist(lead.id, lead.fase_id)

  const idxAtual = fases.findIndex(f => f.id === lead.fase_id)

  function handleClicarFase(fase: Fase, idx: number) {
    if (idx <= idxAtual) return

    const bloqueadores = itensChecklist.filter(i => i.bloqueia_avanco && !i.concluido)
    if (bloqueadores.length > 0) {
      const pendentes = bloqueadores.map(i => i.descricao ?? 'item').join(', ')
      toast.error('Checklist obrigatório pendente', {
        description: `Conclua antes de avançar: ${pendentes}`,
      })
      return
    }

    setFasePendente(fase)
  }

  function handleConfirmar() {
    if (!fasePendente) return
    const isConcluido = fasePendente.nome === 'Concluído'
    editarLead.mutate(
      { id: lead.id, fase_id: fasePendente.id },
      {
        onSuccess: () => {
          setFasePendente(null)
          if (isConcluido) onConcluido?.()
        },
        onError: () => {
          setFasePendente(null)
          toast.error('Erro ao mover o Lead. Tente novamente.')
        },
      }
    )
  }

  return (
    <>
      {/* ── Barra de fases estilo Ploomes ── */}
      <div className="flex shrink-0 overflow-x-auto border-b border-gray-200 bg-white [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {fases.map((fase, idx) => {
          const isAtual  = idx === idxAtual
          const isPast   = idx < idxAtual
          const isFutura = idx > idxAtual
          const isFirst  = idx === 0
          const isLast   = idx === fases.length - 1

          // Cor de fundo: atual = cor da fase, passada = verde/cinza claro, futura = cinza muito claro
          const bg = isAtual
            ? (fase.cor ?? 'var(--fonti-primary)')
            : isPast
              ? '#e5e7eb'   // gray-200
              : '#f9fafb'   // gray-50

          const textColor = isAtual ? '#ffffff' : isPast ? '#6b7280' : '#9ca3af'

          return (
            <button
              key={fase.id}
              disabled={!isFutura || editarLead.isPending}
              onClick={() => handleClicarFase(fase, idx)}
              title={isFutura ? `Mover para ${fase.nome}` : fase.nome}
              className={cn(
                'relative flex h-9 items-center justify-center whitespace-nowrap text-xs font-semibold transition-all select-none focus:outline-none',
                // padding extra para o recuo da seta
                isFirst ? 'pl-4' : 'pl-[calc(1rem+14px)]',
                isLast  ? 'pr-4' : 'pr-[calc(1rem+14px)]',
                // sobreposição: cada fase fica 14px à esquerda da anterior
                idx > 0 && '-ml-[14px]',
                // z-index crescente para que a fase atual fique na frente das seguintes
                idx === idxAtual && 'z-10',
                isPast   && 'z-[5]',
                isFutura && cn('z-[4] cursor-pointer', 'hover:brightness-95'),
              )}
              style={{
                clipPath: clipPath(isFirst, isLast),
                backgroundColor: bg,
                color: textColor,
                // fases futuras: simular borda com shadow inset
                boxShadow: isFutura ? 'inset 0 0 0 1px #e5e7eb' : undefined,
              }}
            >
              {fase.nome}
            </button>
          )
        })}
      </div>

      {/* Modal de confirmação */}
      <Dialog open={!!fasePendente} onOpenChange={(o) => { if (!o) setFasePendente(null) }}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-fonti-primary">Mover Lead</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-700 py-2">
            Deseja mover <strong>{lead.nome}</strong> para a fase{' '}
            <strong>{fasePendente?.nome}</strong>?
          </p>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => setFasePendente(null)}
              disabled={editarLead.isPending}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              className="flex-1 bg-fonti-primary hover:bg-fonti-primary-hover text-white"
              onClick={handleConfirmar}
              disabled={editarLead.isPending}
            >
              {editarLead.isPending ? 'Movendo...' : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
