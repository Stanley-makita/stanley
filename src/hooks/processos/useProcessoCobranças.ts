'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { type ProcessoCobranca } from '@/types/processos'
import { toast } from 'sonner'

export function useProcessoCobranças(processoId: string) {
  return useQuery({
    queryKey: ['processos', processoId, 'cobranças'],
    queryFn: async (): Promise<ProcessoCobranca[]> => {
      const { data, error } = await supabase
        .from('processo_cobranças')
        .select('*')
        .eq('processo_id', processoId)
        .order('data_vencimento', { ascending: true })
      if (error) throw error
      return data
    },
    enabled: !!processoId,
  })
}

export function useAdicionarCobrança(processoId: string) {
  const queryClient = useQueryClient()
  const { usuario } = useAuth()

  return useMutation({
    mutationFn: async (input: { descricao: string; valor: number; data_vencimento: string }) => {
      const { error } = await supabase
        .from('processo_cobranças')
        .insert({
          ...input,
          processo_id: processoId,
          empresa_id: usuario!.empresa_id,
          usuario_id: usuario!.id,
          status: 'pendente',
        })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processos', processoId, 'cobranças'] })
      toast.success('Cobrança adicionada.', { className: 'border-l-4 border-l-fonti-accent bg-fonti-accent-hover text-fonti-primary' })
    },
    onError: () => toast.error('Erro ao adicionar cobrança.'),
  })
}

export function useAtualizarStatusCobrança(processoId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, status, data_pagamento }: {
      id: string
      status: ProcessoCobranca['status']
      data_pagamento?: string
    }) => {
      const { error } = await supabase
        .from('processo_cobranças')
        .update({ status, data_pagamento: data_pagamento ?? null })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processos', processoId, 'cobranças'] })
      toast.success('Status atualizado.', { className: 'border-l-4 border-l-fonti-accent bg-fonti-accent-hover text-fonti-primary' })
    },
    onError: () => toast.error('Erro ao atualizar cobrança.'),
  })
}