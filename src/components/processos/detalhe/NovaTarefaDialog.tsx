'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCriarTarefa } from '@/hooks/processos/useProcessoTarefas'
import { useAuth } from '@/hooks/auth/useAuth'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  processoId: string
}

export function NovaTarefaDialog({ open, onOpenChange, processoId }: Props) {
  const { usuario } = useAuth()
  const criar = useCriarTarefa(processoId)
  const [titulo, setTitulo] = useState('')
  const [prioridade, setPrioridade] = useState<'alta' | 'media' | 'baixa'>('media')
  const [dataPrazo, setDataPrazo] = useState('')

  function reset() {
    setTitulo('')
    setPrioridade('media')
    setDataPrazo('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!titulo.trim()) return
    await criar.mutateAsync({
      titulo: titulo.trim(),
      prioridade,
      responsavel_id: usuario?.id,
      data_prazo: dataPrazo || undefined,
    })
    reset()
    onOpenChange(false)
  }

  function handleOpenChange(v: boolean) {
    if (!v) reset()
    onOpenChange(v)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Nova Tarefa</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <Label htmlFor="tarefa-titulo">Título <span className="text-red-500">*</span></Label>
            <Input
              id="tarefa-titulo"
              placeholder="Descreva a tarefa..."
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Prioridade</Label>
              <Select value={prioridade} onValueChange={(v) => setPrioridade(v as typeof prioridade)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="media">Média</SelectItem>
                  <SelectItem value="baixa">Baixa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Data Prazo</Label>
              <Input
                type="date"
                value={dataPrazo}
                onChange={(e) => setDataPrazo(e.target.value)}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={!titulo.trim() || criar.isPending}
              className="bg-[#253B29] hover:bg-[#1a2b1e] text-white"
            >
              {criar.isPending ? 'Criando...' : 'Criar Tarefa'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
