'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { supabase } from '@/lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { RotateCcw } from 'lucide-react'

interface Props {
  aberto: boolean
  lead: { id: string; nome: string }
  onFechar: () => void
}

// Desfaz o "Marcar como perdido" (só admin — decisão 20/10/2026). O motivo vira nota
// "LEAD REATIVADO - ..." (mesmo padrão do "MOTIVO CLIENTE PERDIDO - ..."), então fica nas
// Notas e no Histórico. O lead volta na mesma fase em que estava quando foi perdido.
export function ModalReativarLead({ aberto, lead, onFechar }: Props) {
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
        p_descricao: `LEAD REATIVADO - ${motivo}`,
        p_tipo: 'comentario',
      })
      if (erroNota) throw erroNota

      // .select: UPDATE barrado pela RLS não dá erro, só volta vazio (ver CLAUDE.md).
      const { data, error: erroLead } = await supabase
        .from('leads')
        .update({ perdido_em: null })
        .eq('id', lead.id)
        .select('id')
      if (erroLead) throw erroLead
      if (!data?.length) throw new Error('Sem permissão para reativar este lead.')

      queryClient.invalidateQueries({ queryKey: ['leads'] })
      toast.success('Lead reativado.')
      setTexto('')
      onFechar()
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : 'Erro ao reativar o lead.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o) onFechar() }}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-fonti-primary">
            <RotateCcw className="h-4 w-4" />
            Reativar {lead.nome}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-gray-600">
          O lead volta a ficar ativo, na mesma fase em que estava. O motivo fica registrado nas Notas e no Histórico.
        </p>
        <Textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Por que o lead está sendo reativado?"
          rows={4}
          autoFocus
        />
        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
          <Button variant="outline" onClick={onFechar} disabled={salvando}>Cancelar</Button>
          <Button
            className="bg-fonti-primary hover:bg-fonti-primary-hover text-white"
            onClick={handleConfirmar}
            disabled={!texto.trim() || salvando}
          >
            {salvando ? 'Reativando...' : 'Reativar lead'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
