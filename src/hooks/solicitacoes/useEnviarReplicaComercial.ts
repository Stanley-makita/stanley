'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

export function useEnviarReplicaComercial() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, texto }: { id: string; texto: string }) => {
      const { error } = await supabase.rpc('enviar_replica_comercial', {
        p_id: id,
        p_texto: texto,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['solicitacoes'] })
      toast.success('Réplica enviada.', {
        className: 'border-l-4 border-l-fonti-accent bg-fonti-accent-hover text-fonti-primary',
      })
    },
    onError: (err: any) => {
      console.error('Erro ao enviar réplica:', err)
      toast.error(`Erro ao enviar: ${err?.message ?? 'Tente novamente'}`)
    },
  })
}
