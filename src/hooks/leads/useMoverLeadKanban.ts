'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { type MoverLeadInput } from '@/types/leads'
import { toast } from 'sonner'

export function useMoverLeadKanban() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: MoverLeadInput) => {
      const { error } = await supabase.rpc('mover_lead_kanban', {
        p_lead_id: input.lead_id,
        p_fase_id_destino: input.fase_id_destino,
        p_ordem_destino: input.ordem_destino,
      })

      if (error) throw error
    },
    onSuccess: (_, input) => {
      queryClient.invalidateQueries({ queryKey: ['leads', 'fase'] })
      queryClient.invalidateQueries({ queryKey: ['leads', input.lead_id] })
    },
    onError: (err: unknown, input) => {
      toast.error(`Erro ao mover lead. Tente novamente.`)
      queryClient.invalidateQueries({ queryKey: ['leads', 'fase'] })
      queryClient.invalidateQueries({ queryKey: ['leads', input.lead_id] })
    },
  })
}