'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/auth/useAuth'
import type { FaseStatus } from '@/types/leads'

const supabase = createClient()

export function useFaseStatuses(faseId: string | null | undefined) {
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['fase_statuses', faseId],
    queryFn: async (): Promise<FaseStatus[]> => {
      const { data, error } = await supabase
        .from('fase_statuses')
        .select('*')
        .eq('fase_id', faseId!)
        .eq('ativo', true)
        .order('ordem', { ascending: true })

      if (error) throw error
      return data
    },
    staleTime: 60_000,
    enabled: !!faseId && !!usuario,
  })
}

export function useCriarFaseStatus() {
  const queryClient = useQueryClient()
  const { usuario } = useAuth()

  return useMutation({
    mutationFn: async (input: { fase_id: string; nome: string; cor?: string; ordem?: number }) => {
      const { data, error } = await supabase
        .from('fase_statuses')
        .insert({
          ...input,
          empresa_id: usuario!.empresa_id,
          cor: input.cor ?? '#6B7280',
          ordem: input.ordem ?? 999,
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['fase_statuses', data.fase_id] })
    },
  })
}

export function useAtualizarFaseStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: { id: string; fase_id: string; nome?: string; cor?: string }) => {
      const { id, fase_id, ...campos } = input
      const { data, error } = await supabase
        .from('fase_statuses')
        .update(campos)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return { ...data, fase_id }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['fase_statuses', data.fase_id] })
    },
  })
}

export function useExcluirFaseStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: { id: string; fase_id: string }) => {
      const { error } = await supabase
        .from('fase_statuses')
        .update({ ativo: false })
        .eq('id', input.id)
      if (error) throw error
      return input
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['fase_statuses', data.fase_id] })
    },
  })
}

export function useReordenarFaseStatuses() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (statuses: Array<{ id: string; ordem: number; fase_id: string }>) => {
      const { error } = await supabase.rpc('reordenar_fase_statuses', {
        statuses_input: statuses.map(({ id, ordem }) => ({ id, ordem })),
      })
      if (error) throw error
      return statuses
    },
    onSuccess: (statuses) => {
      if (statuses.length > 0) {
        queryClient.invalidateQueries({ queryKey: ['fase_statuses', statuses[0].fase_id] })
      }
    },
  })
}
