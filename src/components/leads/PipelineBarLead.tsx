'use client'

import { useState } from 'react'
import { useEditarLead } from '@/hooks/leads/useEditarLead'
import { useLeadChecklist } from '@/hooks/leads/useLeadChecklist'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { FaseBreadcrumbBar } from '@/components/shared/FaseBreadcrumbBar'
import { toast } from 'sonner'
import type { Lead } from '@/types/leads'
import type { Fase } from '@/types/configuracoes'

interface Props {
  lead: Lead
  fases: Fase[]
  onConcluido?: () => void
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
      <FaseBreadcrumbBar
        fases={fases}
        faseAtualId={lead.fase_id}
        podeClicar={(idx) => idx > idxAtual}
        onClicarFase={handleClicarFase}
        disabled={editarLead.isPending}
      />

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
