'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useUsuarioAtual } from '@/hooks/useUsuarioAtual'
import type { Banco, BancoInsert } from '@/types/configuracoes'

const supabase = createClient()

export type BancoUpdate = Partial<Omit<Banco, 'id' | 'empresa_id' | 'created_at' | 'updated_at'>>

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
  const { data: usuario } = useUsuarioAtual()
  return useMutation({
    mutationFn: async (banco: Omit<BancoInsert, 'empresa_id'>) => {
      const { data, error } = await supabase
        .from('bancos')
        .insert({ ...banco, empresa_id: usuario!.empresa_id })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bancos'] }),
  })
}

export function useAtualizarBanco() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...dados }: BancoUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('bancos')
        .update(dados)
        .eq('id', id)
        .select()
        .single()
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