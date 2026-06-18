'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import type { RhFerias, RhAusencia, RhStatusFerias } from '@/types/rh'

export function useFerias(filtros: { status?: RhStatusFerias; funcionarioId?: string } = {}) {
  const { usuario } = useAuth()
  return useQuery({
    queryKey: ['rh', 'ferias', usuario?.empresa_id, filtros],
    enabled: !!usuario,
    queryFn: async (): Promise<RhFerias[]> => {
      let q = supabase.from('rh_ferias')
        .select('*, funcionario:rh_funcionarios(id, nome)')
        .eq('empresa_id', usuario!.empresa_id)
        .order('ferias_inicio', { ascending: false })
      if (filtros.status) q = q.eq('status', filtros.status)
      if (filtros.funcionarioId) q = q.eq('funcionario_id', filtros.funcionarioId)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as unknown as RhFerias[]
    },
  })
}

export function useCriarFerias() {
  const { usuario } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (dados: Omit<RhFerias, 'id' | 'empresa_id' | 'created_at' | 'updated_at' | 'funcionario'>) => {
      const { error } = await supabase.from('rh_ferias')
        .insert({ ...dados, empresa_id: usuario!.empresa_id })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rh', 'ferias'] }),
  })
}

export function useAtualizarFerias() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...dados }: Partial<RhFerias> & { id: string }) => {
      const { error } = await supabase.from('rh_ferias').update(dados).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rh', 'ferias'] }),
  })
}

export function useExcluirFerias() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('rh_ferias').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rh', 'ferias'] }),
  })
}

export function useAusencias(funcionarioId?: string) {
  const { usuario } = useAuth()
  return useQuery({
    queryKey: ['rh', 'ausencias', usuario?.empresa_id, funcionarioId],
    enabled: !!usuario,
    queryFn: async (): Promise<RhAusencia[]> => {
      let q = supabase.from('rh_ausencias')
        .select('*, funcionario:rh_funcionarios(id, nome)')
        .eq('empresa_id', usuario!.empresa_id)
        .order('data_inicio', { ascending: false })
      if (funcionarioId) q = q.eq('funcionario_id', funcionarioId)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as unknown as RhAusencia[]
    },
  })
}

export function useCriarAusencia() {
  const { usuario } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (dados: Omit<RhAusencia, 'id' | 'empresa_id' | 'created_at' | 'funcionario'>) => {
      const { error } = await supabase.from('rh_ausencias')
        .insert({ ...dados, empresa_id: usuario!.empresa_id })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rh', 'ausencias'] })
      qc.invalidateQueries({ queryKey: ['rh', 'dashboard'] })
    },
  })
}
