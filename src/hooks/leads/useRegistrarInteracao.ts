'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

export function useRegistrarInteracao(leadId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (descricao: string) => {
      const { error } = await supabase.rpc('registrar_interacao_lead', {
        p_lead_id: leadId,
        p_descricao: descricao,
        p_tipo: 'comentario',
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads', leadId, 'historico'], exact: false })
    },
    onError: (err: unknown) => {
      console.error('[useRegistrarInteracao]', err)
      toast.error('Erro ao registrar interação.')
    },
  })
}
