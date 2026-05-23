'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { type ProcessoVendedor } from '@/types/processos'
import { toast } from 'sonner'

export function useProcessoVendedores(processoId: string) {
  return useQuery({
    queryKey: ['processos', processoId, 'vendedores'],
    queryFn: async (): Promise<ProcessoVendedor[]> => {
      const { data, error } = await supabase
        .from('processo_vendedores')
        .select('*')
        .eq('processo_id', processoId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data
    },
    enabled: !!processoId,
  })
}

export function useAdicionarVendedor(processoId: string) {
  const queryClient = useQueryClient()
  const { usuario } = useAuth()

  return useMutation({
    mutationFn: async (input: Omit<ProcessoVendedor, 'id' | 'processo_id' | 'empresa_id' | 'created_at' | 'updated_at'>) => {
      const { error } = await supabase
        .from('processo_vendedores')
        .insert({ ...input, processo_id: processoId, empresa_id: usuario!.empresa_id })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processos', processoId, 'vendedores'] })
      toast.success('Vendedor adicionado.', { className: 'border-l-4 border-l-[#C2AA6A] bg-[#E7E0C4] text-[#253B29]' })
    },
    onError: () => toast.error('Erro ao adicionar vendedor.'),
  })
}

export function useEditarVendedor(processoId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<ProcessoVendedor> & { id: string }) => {
      const { error } = await supabase
        .from('processo_vendedores')
        .update(input)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processos', processoId, 'vendedores'] })
      toast.success('Vendedor atualizado.', { className: 'border-l-4 border-l-[#C2AA6A] bg-[#E7E0C4] text-[#253B29]' })
    },
    onError: () => toast.error('Erro ao atualizar vendedor.'),
  })
}

export function useRemoverVendedor(processoId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (vendedorId: string) => {
      const { error } = await supabase
        .from('processo_vendedores')
        .delete()
        .eq('id', vendedorId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processos', processoId, 'vendedores'] })
    },
    onError: () => toast.error('Erro ao remover vendedor.'),
  })
}