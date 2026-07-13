'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { supabase } from '@/lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { XCircle } from 'lucide-react'

interface Props {
  aberto: boolean
  lead: { id: string; nome: string }
  onFechar: () => void
}

export function ModalMarcarPerdido({ aberto, lead, onFechar }: Props) {
  const queryClient = useQueryClient()
  const [texto, setTexto] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function handleConfirmar() {
    const motivo = texto.trim()
    if (!motivo) return
    setSalvando(true)
    try {
      const { error: erroNota } = await supabase.rpc('registrar_interacao_lead', {
        p_lead_id: lead.id,
        p_descricao: `MOTIVO CLIENTE PERDIDO - ${motivo}`,
        p_tipo: 'comentario',
      })
      if (erroNota) throw erroNota

      const { error: erroLead } = await supabase
        .from('leads')
        .update({ perdido_em: new Date().toISOString() })
        .eq('id', lead.id)
      if (erroLead) throw erroLead

      queryClient.invalidateQueries({ queryKey: ['leads', lead.id] })
      queryClient.invalidateQueries({ queryKey: ['leads', lead.id, 'historico'], exact: false })
      toast.success('Lead marcado como perdido.')
      setTexto('')
      onFechar()
    } catch (err) {
      console.error(err)
      toast.error('Erro ao marcar lead como perdido.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o) onFechar() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-fonti-primary">
            <XCircle className="h-5 w-5 text-red-500" />
            Marcar {lead.nome} como perdido
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-gray-600">
          Essa ação bloqueia as ações do lead (fica só para visualização). Se o
          cliente retornar, um novo lead deve ser criado.
        </p>

        <Textarea
          autoFocus
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Motivo do lead perdido..."
          className="min-h-[100px] text-sm"
        />

        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button
            className="bg-red-600 hover:bg-red-700 text-white"
            disabled={!texto.trim() || salvando}
            onClick={handleConfirmar}
          >
            {salvando ? 'Salvando...' : 'Confirmar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
