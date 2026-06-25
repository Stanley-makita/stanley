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
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useExcluirUsuario } from '../../_hooks/useUsuarios'
import type { Usuario } from '@/types/configuracoes'

const MOTIVOS = [
  'Usuário duplicado',
  'Colaborador desligado',
  'Criado por engano',
  'Outro',
]

interface Props {
  usuario: Usuario | null
  onFechar: () => void
}

export function ExcluirUsuarioDialog({ usuario, onFechar }: Props) {
  const excluir = useExcluirUsuario()
  const [motivo, setMotivo] = useState('')
  const [observacao, setObservacao] = useState('')

  function handleFechar() {
    setMotivo('')
    setObservacao('')
    onFechar()
  }

  async function handleConfirmar() {
    if (!usuario) return
    const motivoFinal = observacao.trim()
      ? `${motivo} — ${observacao.trim()}`
      : motivo
    try {
      await excluir.mutateAsync({ id: usuario.id, motivo: motivoFinal })
      toast.success('Usuário excluído')
      handleFechar()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível excluir o usuário')
    }
  }

  return (
    <Dialog open={!!usuario} onOpenChange={handleFechar}>
      <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <Trash2 className="h-4 w-4" />
            Excluir usuário
          </DialogTitle>
          <DialogDescription>
            Tem certeza que deseja excluir{' '}
            <span className="font-semibold text-gray-900">{usuario?.nome}</span>
            {usuario?.email ? (
              <> ({usuario.email})</>
            ) : null}?
            <br />
            Esta ação pode ser revertida pelo suporte.
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
              Observação adicional{' '}
              <span className="text-gray-400 font-normal">(opcional)</span>
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
          <Button variant="outline" onClick={handleFechar} disabled={excluir.isPending}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            disabled={!motivo || excluir.isPending}
            onClick={handleConfirmar}
          >
            {excluir.isPending ? 'Excluindo...' : 'Excluir usuário'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
