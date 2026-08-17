'use client'

import { useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export function useConcluirTarefa() {
  return useMutation({
    mutationFn: async ({ tarefaId, fonte }: { tarefaId: string; fonte?: 'processo' | 'lead' | 'compromisso' }) => {
      if (fonte === 'compromisso') {
        const { error } = await supabase
          .from('compromissos')
          .update({ concluido: true, concluido_em: new Date().toISOString() })
          .eq('id', tarefaId)
        if (error) throw error
        return
      }
      const tabela = fonte === 'lead' ? 'lead_tarefas' : 'processo_tarefas'
      const { error } = await supabase
        .from(tabela)
        .update({
          concluida: true,
          concluida_em: new Date().toISOString(),
        })
        .eq('id', tarefaId)
      if (error) throw error
    },
  })
}
