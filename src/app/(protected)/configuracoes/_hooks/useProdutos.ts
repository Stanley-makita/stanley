'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Produto, ProdutoInsert } from '@/types/configuracoes'

const supabase = createClient()

export type ProdutoUpdate = Partial<Omit<Produto, 'id' | 'empresa_id' | 'created_at' | 'updated_at'>>

export function useProdutos() {
  return useQuery({
    queryKey: ['produtos'],
    queryFn: async (): Promise<Produto[]> => {
      const { data, error } = await supabase
        .from('produtos')
        .select('*')
        .eq('ativo', true)
        .order('nome')
      if (error) throw error
      return data as Produto[]
    },
    staleTime: 120_000,
  })
}

export function useCriarProduto() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (produto: ProdutoInsert) => {
      const { data, error } = await supabase.from('produtos').insert(produto).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['produtos'] }),
  })
}

export function useAtualizarProduto() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...dados }: ProdutoUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('produtos')
        .update(dados)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['produtos'] }),
  })
}

export function useExcluirProduto() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('produtos').update({ ativo: false }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['produtos'] }),
  })
}
