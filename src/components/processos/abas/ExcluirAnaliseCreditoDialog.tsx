'use client'

import { useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Trash2 } from 'lucide-react'
import type { LeadAnaliseCredito } from '@/types/leads'

interface Props {
  analise: LeadAnaliseCredito | null
  onFechar: () => void
  onConfirmar: (motivo: string) => void
  isPending: boolean
}

/**
 * Exclusão de análise de crédito — só oferecida ao perfil admin (gate no
 * componente pai, AbaCredito de Processos). Motivo obrigatório: o evento
 * fica registrado no histórico de comentários do processo, já que a linha
 * em si é removida de verdade da tabela (hard delete, como sempre foi).
 */
export function ExcluirAnaliseCreditoDialog({ analise, onFechar, onConfirmar, isPending }: Props) {
  const [motivo, setMotivo] = useState('')

  function handleFechar() {
    setMotivo('')
    onFechar()
  }

  function handleConfirmar() {
    if (!motivo.trim()) return
    onConfirmar(motivo.trim())
  }

  return (
    <Dialog open={!!analise} onOpenChange={handleFechar}>
      <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <Trash2 className="h-4 w-4" />
            Excluir análise de crédito
          </DialogTitle>
          <DialogDescription>
            Tem certeza que deseja excluir a análise{' '}
            <span className="font-semibold text-gray-900">
              {analise?.banco_pretendido ?? analise?.nome}
            </span>?
            <br />
            Essa ação não pode ser desfeita. O motivo fica registrado no histórico do processo.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          <label className="text-xs font-medium text-gray-700 mb-1.5 block">
            Motivo da exclusão <span className="text-red-500">*</span>
          </label>
          <Textarea
            rows={3}
            placeholder="Descreva o motivo (obrigatório)..."
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleFechar} disabled={isPending}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            disabled={!motivo.trim() || isPending}
            onClick={handleConfirmar}
          >
            {isPending ? 'Excluindo...' : 'Excluir análise'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
