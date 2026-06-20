'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { type Processo } from '@/types/processos'
import { toast } from 'sonner'
import { avancarFaseLead } from '@/lib/leads/avancarFaseLead'

export function useCriarProcesso() {
  const queryClient = useQueryClient()
  const { usuario } = useAuth()

  return useMutation({
    mutationFn: async (input: Omit<Processo, 'id' | 'empresa_id' | 'numero_processo' | 'created_at' | 'updated_at' | 'deleted_at'>): Promise<Processo> => {
      // numero é gerado via trigger SQL
      const { data, error } = await supabase
        .from('processos')
        .insert({ ...input, empresa_id: usuario!.empresa_id })
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: async (processo) => {
      queryClient.invalidateQueries({ queryKey: ['processos'] })
      toast.success('Processo criado com sucesso!', {
        className: 'border-l-4 border-l-fonti-accent bg-fonti-accent-hover text-fonti-primary',
      })

      if (processo.lead_id) {
        await avancarFaseLead(supabase, queryClient, processo.lead_id, 'Concluído')
      }
    },
    onError: (err: any) => {
      console.error('Erro ao criar processo:', err)
      toast.error(`Erro: ${err?.message ?? 'Erro desconhecido'}`)
    },
  })
}