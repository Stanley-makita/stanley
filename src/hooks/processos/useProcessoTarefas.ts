'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { type ProcessoTarefa } from '@/types/processos'
import { toast } from 'sonner'

export function useProcessoTarefas(processoId: string) {
  return useQuery({
    queryKey: ['processos', processoId, 'tarefas'],
    queryFn: async (): Promise<ProcessoTarefa[]> => {
      const { data, error } = await supabase
        .from('processo_tarefas')
        .select('*, responsavel:usuarios!responsavel_id(nome)')
        .eq('processo_id', processoId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })

      if (error) throw error
      return data
    },
    enabled: !!processoId,
  })
}

export function useCriarTarefa(processoId: string) {
  const queryClient = useQueryClient()
  const { usuario } = useAuth()

  return useMutation({
    mutationFn: async (input: {
      titulo: string
      prioridade: ProcessoTarefa['prioridade']
      responsavel_id?: string
      data_prazo?: string
    }) => {
      const { error } = await supabase
        .from('processo_tarefas')
        .insert({
          processo_id: processoId,
          empresa_id: usuario!.empresa_id,
          status: 'pendente',
          ...input,
        })

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processos', processoId, 'tarefas'] })
      toast.success('Tarefa criada.', {
        className: 'border-l-4 border-l-[#C2AA6A] bg-[#E7E0C4] text-[#253B29]',
      })
    },
  })
}

export function useConcluirTarefa(processoId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (tarefaId: string) => {
      const { error } = await supabase
        .from('processo_tarefas')
        .update({ status: 'concluida' })
        .eq('id', tarefaId)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processos', processoId, 'tarefas'] })
    },
  })
}