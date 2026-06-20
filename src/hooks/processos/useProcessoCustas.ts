'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { type ProcessoCusta } from '@/types/processos'
import { toast } from 'sonner'

export function useProcessoCustas(processoId: string) {
  return useQuery({
    queryKey: ['processos', processoId, 'custas'],
    queryFn: async (): Promise<ProcessoCusta[]> => {
      const { data, error } = await supabase
        .from('processo_custas')
        .select('*')
        .eq('processo_id', processoId)
        .order('data_custa', { ascending: false })
      if (error) throw error
      return data
    },
    enabled: !!processoId,
  })
}

export function useAdicionarCusta(processoId: string) {
  const queryClient = useQueryClient()
  const { usuario } = useAuth()

  return useMutation({
    mutationFn: async (input: { descricao: string; valor: number; data_custa: string }) => {
      const { error } = await supabase
        .from('processo_custas')
        .insert({
          ...input,
          processo_id: processoId,
          empresa_id: usuario!.empresa_id,
          usuario_id: usuario!.id,
          pago: false,
        })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processos', processoId, 'custas'] })
      toast.success('Custa adicionada.', { className: 'border-l-4 border-l-fonti-accent bg-fonti-accent-hover text-fonti-primary' })
    },
    onError: () => toast.error('Erro ao adicionar custa.'),
  })
}

export function useToggleCustaPaga(processoId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, pago }: { id: string; pago: boolean }) => {
      const { error } = await supabase
        .from('processo_custas')
        .update({ pago })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processos', processoId, 'custas'] })
    },
    onError: () => toast.error('Erro ao atualizar custa.'),
  })
}