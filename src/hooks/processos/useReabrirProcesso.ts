'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

/**
 * Reabre um processo marcado como Concluído — só admin/gestor/gerente
 * (enforcement real via usuario_atual_pode dentro do RPC, não só client).
 * Exige motivo, registrado em processos.motivo_reabertura.
 */
export function useReabrirProcesso(processoId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (motivo: string) => {
      const { error } = await supabase.rpc('reabrir_processo', {
        p_processo_id: processoId,
        p_motivo: motivo,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processos', processoId] })
      queryClient.invalidateQueries({ queryKey: ['processos'] })
      queryClient.invalidateQueries({ queryKey: ['checklist-execucoes', processoId] })
      toast.success('Processo reaberto.', {
        className: 'border-l-4 border-l-fonti-accent bg-fonti-accent-hover text-fonti-primary',
      })
    },
    onError: (err: Error) => {
      if (err.message.includes('Sem permissão para reabrir')) {
        toast.error('Você não tem permissão para reabrir este processo.')
        return
      }
      toast.error(err.message || 'Erro ao reabrir processo.')
    },
  })
}
