'use client'

import { useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useExcluirLead } from '@/hooks/leads/useExcluirLead'
import { Trash2 } from 'lucide-react'

const MOTIVOS = [
  'Duplicado',
  'Dados incorretos',
  'Solicitação do cliente',
  'Teste',
  'Outro',
]

interface Props {
  aberto: boolean
  onFechar: () => void
  leadId: string
  faseId: string
  nomeCliente: string
  onExcluido?: () => void
}

export function ExcluirLeadDialog({ aberto, onFechar, leadId, faseId, nomeCliente, onExcluido }: Props) {
  const excluirLead = useExcluirLead()
  const [motivo, setMotivo] = useState('')
  const [observacao, setObservacao] = useState('')

  function handleFechar() {
    setMotivo('')
    setObservacao('')
    onFechar()
  }

  async function handleConfirmar() {
    const motivoFinal = observacao.trim()
      ? `${motivo} — ${observacao.trim()}`
      : motivo

    await excluirLead.mutateAsync({ leadId, faseId, motivo: motivoFinal })
    handleFechar()
    onExcluido?.()
  }

  return (
    <Dialog open={aberto} onOpenChange={handleFechar}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <Trash2 className="h-4 w-4" />
            Excluir lead
          </DialogTitle>
          <DialogDescription>
            Tem certeza que deseja excluir o lead{' '}
            <span className="font-semibold text-gray-900">{nomeCliente}</span>?
            <br />
            Esta ação pode ser revertida pelo suporte, mas o lead sumirá do kanban imediatamente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1.5 block">
              Motivo da exclusão <span className="text-red-500">*</span>
            </label>
            <Select value={motivo} onValueChange={setMotivo}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o motivo..." />
              </SelectTrigger>
              <SelectContent>
                {MOTIVOS.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-700 mb-1.5 block">
              Observação adicional <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <Textarea
              rows={2}
              placeholder="Descreva se necessário..."
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleFechar} disabled={excluirLead.isPending}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            disabled={!motivo || excluirLead.isPending}
            onClick={handleConfirmar}
          >
            {excluirLead.isPending ? 'Excluindo...' : 'Excluir lead'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
