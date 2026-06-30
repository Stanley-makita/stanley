'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { CheckCircle2, Clock, Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { toast } from 'sonner'

interface Props {
  aberto: boolean
  lead: { id: string; nome: string; empresa_id: string; responsavel_id: string | null }
  onCriarProcesso: () => void
  onAindaNao: () => void
  onFechar: () => void
}

export function ModalConcluirLead({ aberto, lead, onCriarProcesso, onAindaNao, onFechar }: Props) {
  const { usuario } = useAuth()
  const [carregando, setCarregando] = useState(false)

  async function handleAindaNao() {
    setCarregando(true)
    try {
      // Cria o follow-up automático
      const { error } = await supabase.from('lead_followups').upsert(
        {
          empresa_id:           lead.empresa_id,
          lead_id:              lead.id,
          responsavel_id:       lead.responsavel_id,
          status:               'ativo',
          proxima_notificacao:  new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
          dias_sem_processo:    0,
        },
        { onConflict: 'lead_id', ignoreDuplicates: false }
      )
      if (error) throw error

      // Registra no histórico do lead
      await supabase.from('lead_historico').insert({
        lead_id:     lead.id,
        empresa_id:  lead.empresa_id,
        usuario_id:  usuario?.id,
        tipo:        'followup_iniciado',
        descricao:   'Acompanhamento automático iniciado — cliente ainda não decidiu sobre criação do Processo.',
      })

      toast.success('Acompanhamento iniciado', {
        description: 'O Fonti enviará lembretes ao comercial a cada 3 dias.',
      })

      onAindaNao()
    } catch (err) {
      console.error(err)
      toast.error('Erro ao iniciar acompanhamento.')
    } finally {
      setCarregando(false)
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o) onFechar() }}>
      <DialogContent className="max-h-[92svh] w-[calc(100vw-1rem)] max-w-sm overflow-y-auto sm:w-full">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-fonti-primary">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            Lead Concluído
          </DialogTitle>
        </DialogHeader>

        <div className="py-3 space-y-4">
          <p className="text-sm text-gray-700 leading-relaxed">
            O crédito de <strong>{lead.nome}</strong> foi aprovado.
            <br />
            O cliente deseja prosseguir para a criação do Processo?
          </p>
        </div>

        <div className="grid gap-3">
          <Button
            className="w-full gap-2 bg-fonti-primary hover:bg-fonti-primary-hover text-white"
            onClick={onCriarProcesso}
          >
            <Plus className="h-4 w-4" />
            Criar Processo
          </Button>

          <Button
            variant="outline"
            className="w-full gap-2 text-amber-700 border-amber-300 hover:bg-amber-50"
            disabled={carregando}
            onClick={handleAindaNao}
          >
            <Clock className="h-4 w-4" />
            {carregando ? 'Aguarde...' : 'Ainda não'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
