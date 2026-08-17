'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useUsuariosEmpresa } from '@/hooks/useUsuariosEmpresa'
import { useUsuarioAtual } from '@/hooks/useUsuarioAtual'
import { useCriarCompromisso } from '@/hooks/useCriarCompromisso'
import { COMPROMISSO_LOCAL_LABELS, type CompromissoLocal } from '@/types/agenda'

interface Props {
  aberto: boolean
  onFechar: () => void
}

export function NovoCompromissoModal({ aberto, onFechar }: Props) {
  const { data: usuarioAtual } = useUsuarioAtual()
  const { data: membros = [] } = useUsuariosEmpresa()
  const criar = useCriarCompromisso()

  const [usuarioId, setUsuarioId] = useState('')
  const [titulo, setTitulo] = useState('')
  const [local, setLocal] = useState<CompromissoLocal>('externo')
  const [data, setData] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [horaInicio, setHoraInicio] = useState('')
  const [horaFim, setHoraFim] = useState('')
  const [descricao, setDescricao] = useState('')

  const donoId = usuarioId || usuarioAtual?.id || ''

  function limpar() {
    setUsuarioId('')
    setTitulo('')
    setLocal('externo')
    setData(format(new Date(), 'yyyy-MM-dd'))
    setHoraInicio('')
    setHoraFim('')
    setDescricao('')
  }

  async function handleSalvar() {
    if (!titulo.trim() || !data || !donoId) return
    try {
      await criar.mutateAsync({
        usuario_id: donoId,
        titulo: titulo.trim(),
        descricao: descricao.trim() || undefined,
        local,
        data,
        hora_inicio: horaInicio || undefined,
        hora_fim: horaFim || undefined,
      })
      limpar()
      onFechar()
    } catch {
      // Erro já exibido via onError de useCriarCompromisso.
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o) { limpar(); onFechar() } }}>
      <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-fonti-primary">Novo Compromisso</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Para <span className="text-red-500">*</span></Label>
            <Select value={donoId} onValueChange={setUsuarioId}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Selecionar usuário..." />
              </SelectTrigger>
              <SelectContent>
                {membros.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Título <span className="text-red-500">*</span></Label>
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Reunião com cliente" className="h-9 text-sm" />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1.5 col-span-1">
              <Label>Data <span className="text-red-500">*</span></Label>
              <Input type="date" value={data} onChange={(e) => setData(e.target.value)} className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label>Início</Label>
              <Input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label>Fim</Label>
              <Input type="time" value={horaFim} onChange={(e) => setHoraFim(e.target.value)} className="h-9 text-sm" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Local <span className="text-red-500">*</span></Label>
            <Select value={local} onValueChange={(v) => setLocal(v as CompromissoLocal)}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(COMPROMISSO_LOCAL_LABELS) as CompromissoLocal[]).map((key) => (
                  <SelectItem key={key} value={key}>{COMPROMISSO_LOCAL_LABELS[key]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {local === 'sede_fontinhas' && (
              <p className="text-[11px] text-gray-400">A recepção também será avisada por WhatsApp.</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Detalhes opcionais..."
              rows={3}
              className="resize-none text-sm"
            />
          </div>

          <p className="text-[11px] text-gray-400">
            O dono do compromisso recebe um aviso por WhatsApp assim que ele é criado.
          </p>
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
          <Button variant="outline" size="sm" className="flex-1" onClick={() => { limpar(); onFechar() }} disabled={criar.isPending}>
            Cancelar
          </Button>
          <Button
            size="sm"
            className="flex-1 bg-fonti-primary hover:bg-fonti-primary-hover text-white"
            disabled={!titulo.trim() || !data || !donoId || criar.isPending}
            onClick={handleSalvar}
          >
            {criar.isPending ? 'Salvando...' : 'Criar compromisso'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
