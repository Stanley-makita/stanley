'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import type { RhFuncionario, RhStatusFuncionario } from '@/types/rh'

const JOINS = `*, cargo:rh_cargos(id, nome, nivel_comissao, departamento:rh_departamentos(id, nome))`

export function useFuncionarios(filtros: { status?: RhStatusFuncionario } = {}) {
  const { usuario } = useAuth()
  return useQuery({
    queryKey: ['rh', 'funcionarios', usuario?.empresa_id, filtros],
    enabled: !!usuario,
    queryFn: async (): Promise<RhFuncionario[]> => {
      let q = supabase.from('rh_funcionarios')
        .select(JOINS)
        .eq('empresa_id', usuario!.empresa_id)
        .order('nome')
      if (filtros.status) q = q.eq('status', filtros.status)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as unknown as RhFuncionario[]
    },
  })
}

export function useCriarFuncionario() {
  const { usuario } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (dados: Omit<RhFuncionario, 'id' | 'empresa_id' | 'created_at' | 'updated_at' | 'cargo'>) => {
      const { data, error } = await supabase.from('rh_funcionarios')
        .insert({ ...dados, empresa_id: usuario!.empresa_id })
        .select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rh', 'funcionarios'] }),
  })
}

export function useAtualizarFuncionario() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...dados }: Partial<RhFuncionario> & { id: string }) => {
      const { error } = await supabase.from('rh_funcionarios').update(dados).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rh', 'funcionarios'] }),
  })
}

export function useExcluirFuncionario() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('rh_funcionarios').update({ status: 'inativo' }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rh', 'funcionarios'] }),
  })
}
