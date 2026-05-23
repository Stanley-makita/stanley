'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Banco, BancoInsert } from '@/types/configuracoes'

const supabase = createClient()

export function useBancos() {
  return useQuery({
    queryKey: ['bancos'],
    queryFn: async (): Promise<Banco[]> => {
      const { data, error } = await supabase
        .from('bancos')
        .select('*')
        .eq('ativo', true)
        .order('nome')
      if (error) throw error
      return data
    },
    staleTime: 120_000,
  })
}

export function useCriarBanco() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (banco: BancoInsert) => {
      const { data, error } = await supabase.from('bancos').insert(banco).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bancos'] }),
  })
}

export function useExcluirBanco() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('bancos').update({ ativo: false }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bancos'] }),
  })
}