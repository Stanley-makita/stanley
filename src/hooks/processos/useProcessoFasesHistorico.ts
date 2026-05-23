'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { type ProcessoFaseHistorico } from '@/types/processos'
import { toast } from 'sonner'

export function useProcessoFasesHistorico(processoId: string) {
  return useQuery({
    queryKey: ['processos', processoId, 'fases-historico'],
    queryFn: async (): Promise<ProcessoFaseHistorico[]> => {
      const { data, error } = await supabase
        .from('processo_fases_historico')
        .select('*, fase:fases!fase_id(id, nome, cor), usuario:usuarios!usuario_id(nome)')
        .eq('processo_id', processoId)
        .order('entrou_em', { ascending: false })
      if (error) throw error
      return data
    },
    enabled: !!processoId,
  })
}

export function useAvancarFase(processoId: string) {
  const queryClient = useQueryClient()
  const { usuario } = useAuth()

  return useMutation({
    mutationFn: async ({ faseId, observacao }: { faseId: string; observacao?: string }) => {
      // 1. Registrar no histórico
      const { error: histError } = await supabase
        .from('processo_fases_historico')
        .insert({
          processo_id: processoId,
          empresa_id: usuario!.empresa_id,
          fase_id: faseId,
          usuario_id: usuario!.id,
          observacao: observacao ?? null,
        })
      if (histError) throw histError

      // 2. Atualizar fase atual no processo
      const { error: procError } = await supabase
        .from('processos')
        .update({ fase_atual_id: faseId })
        .eq('id', processoId)
      if (procError) throw procError
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processos', processoId] })
      queryClient.invalidateQueries({ queryKey: ['processos', processoId, 'fases-historico'] })
      toast.success('Fase avançada com sucesso.', { className: 'border-l-4 border-l-[#C2AA6A] bg-[#E7E0C4] text-[#253B29]' })
    },
    onError: () => toast.error('Erro ao avançar fase.'),
  })
}