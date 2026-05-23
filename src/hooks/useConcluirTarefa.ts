'use client'

import { useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export function useConcluirTarefa() {
  return useMutation({
    mutationFn: async (tarefaId: string) => {
      const { error } = await supabase
        .from('processo_tarefas')
        .update({
          concluida: true,
          concluida_em: new Date().toISOString(),
        })
        .eq('id', tarefaId)
      if (error) throw error
    },
  })
}
