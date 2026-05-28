'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useUsuarioAtual } from '@/hooks/useUsuarioAtual'
import type { RegistroImoveis } from '@/types/imoveis'

export function useRegistrosImoveis() {
  const supabase = createClient()
  const { data: usuario } = useUsuarioAtual()

  return useQuery({
    queryKey: ['registros-imoveis', usuario?.empresa_id],
    enabled: !!usuario?.empresa_id,
    queryFn: async (): Promise<RegistroImoveis[]> => {
      const { data, error } = await supabase
        .from('registros_imoveis')
        .select('*')
        .eq('empresa_id', usuario!.empresa_id)
        .eq('ativo', true)
        .is('deleted_at', null)
        .order('nome')
      if (error) throw error
      return data ?? []
    },
    staleTime: 120_000,
  })
}

export function useTodosRegistrosImoveis() {
  const supabase = createClient()
  const { data: usuario } = useUsuarioAtual()

  return useQuery({
    queryKey: ['registros-imoveis-todos', usuario?.empresa_id],
    enabled: !!usuario?.empresa_id,
    queryFn: async (): Promise<RegistroImoveis[]> => {
      const { data, error } = await supabase
        .from('registros_imoveis')
        .select('*')
        .eq('empresa_id', usuario!.empresa_id)
        .is('deleted_at', null)
        .order('nome')
      if (error) throw error
      return data ?? []
    },
    staleTime: 60_000,
  })
}

export function useCriarRegistroImoveis() {
  const supabase = createClient()
  const { data: usuario } = useUsuarioAtual()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (dados: Omit<RegistroImoveis, 'id' | 'empresa_id' | 'created_at' | 'updated_at' | 'deleted_at'>) => {
      const { data, error } = await supabase
        .from('registros_imoveis')
        .insert({ ...dados, empresa_id: usuario!.empresa_id })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['registros-imoveis', usuario?.empresa_id] })
      queryClient.invalidateQueries({ queryKey: ['registros-imoveis-todos', usuario?.empresa_id] })
    },
  })
}

export function useAtualizarRegistroImoveis() {
  const supabase = createClient()
  const { data: usuario } = useUsuarioAtual()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...dados }: Partial<RegistroImoveis> & { id: string }) => {
      const { data, error } = await supabase
        .from('registros_imoveis')
        .update({ ...dados, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['registros-imoveis', usuario?.empresa_id] })
      queryClient.invalidateQueries({ queryKey: ['registros-imoveis-todos', usuario?.empresa_id] })
    },
  })
}

export function useExcluirRegistroImoveis() {
  const supabase = createClient()
  const { data: usuario } = useUsuarioAtual()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('registros_imoveis')
        .update({ ativo: false, deleted_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['registros-imoveis', usuario?.empresa_id] })
      queryClient.invalidateQueries({ queryKey: ['registros-imoveis-todos', usuario?.empresa_id] })
    },
  })
}
