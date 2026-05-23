'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { type ProcessoMovimento } from '@/types/processos'
import { toast } from 'sonner'

export function useProcessoContaMovimentos(processoId: string) {
  return useQuery({
    queryKey: ['processos', processoId, 'movimentos'],
    queryFn: async (): Promise<ProcessoMovimento[]> => {
      const { data, error } = await supabase
        .from('processo_conta_movimentos')
        .select('*, usuario:usuarios!usuario_id(nome)')
        .eq('processo_id', processoId)
        .order('data_movimento', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
    enabled: !!processoId,
  })
}

export function useAdicionarMovimento(processoId: string) {
  const queryClient = useQueryClient()
  const { usuario } = useAuth()

  return useMutation({
    mutationFn: async (input: { tipo: 'credito' | 'debito'; descricao: string; valor: number; data_movimento: string }) => {
      const { error } = await supabase
        .from('processo_conta_movimentos')
        .insert({
          ...input,
          processo_id: processoId,
          empresa_id: usuario!.empresa_id,
          usuario_id: usuario!.id,
        })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processos', processoId, 'movimentos'] })
      queryClient.invalidateQueries({ queryKey: ['processos', processoId] }) // atualiza saldo_conta
      toast.success('Lançamento registrado.', { className: 'border-l-4 border-l-[#C2AA6A] bg-[#E7E0C4] text-[#253B29]' })
    },
    onError: () => toast.error('Erro ao registrar lançamento.'),
  })
}