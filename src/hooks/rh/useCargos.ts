'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import type { RhCargo, RhDepartamento } from '@/types/rh'

export function useDepartamentos() {
  const { usuario } = useAuth()
  return useQuery({
    queryKey: ['rh', 'departamentos', usuario?.empresa_id],
    enabled: !!usuario,
    queryFn: async (): Promise<RhDepartamento[]> => {
      const { data, error } = await supabase.from('rh_departamentos')
        .select('*')
        .eq('empresa_id', usuario!.empresa_id)
        .eq('ativo', true)
        .order('nome')
      if (error) throw error
      return (data ?? []) as RhDepartamento[]
    },
  })
}

export function useCriarDepartamento() {
  const { usuario } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (nome: string) => {
      const { error } = await supabase.from('rh_departamentos')
        .insert({ nome, empresa_id: usuario!.empresa_id })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rh', 'departamentos'] }),
  })
}

export function useCargos(filtros: { departamentoId?: string } = {}) {
  const { usuario } = useAuth()
  return useQuery({
    queryKey: ['rh', 'cargos', usuario?.empresa_id, filtros],
    enabled: !!usuario,
    queryFn: async (): Promise<RhCargo[]> => {
      let q = supabase.from('rh_cargos')
        .select('*, departamento:rh_departamentos(id, nome), regra_comissao:rh_regras_comissao(id, nome)')
        .eq('empresa_id', usuario!.empresa_id)
        .eq('ativo', true)
        .order('nome')
      if (filtros.departamentoId) q = q.eq('departamento_id', filtros.departamentoId)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as unknown as RhCargo[]
    },
  })
}

export function useCriarCargo() {
  const { usuario } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (dados: Omit<RhCargo, 'id' | 'empresa_id' | 'created_at' | 'updated_at' | 'departamento' | 'regra_comissao'>) => {
      const { error } = await supabase.from('rh_cargos')
        .insert({ ...dados, empresa_id: usuario!.empresa_id })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rh', 'cargos'] }),
  })
}

export function useAtualizarCargo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...dados }: Partial<RhCargo> & { id: string }) => {
      const { error } = await supabase.from('rh_cargos').update(dados).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rh', 'cargos'] }),
  })
}

export function useExcluirCargo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('rh_cargos').update({ ativo: false }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rh', 'cargos'] }),
  })
}
