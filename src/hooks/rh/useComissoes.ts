'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import type { RhRegraComissao, RhFaixaComissao } from '@/types/rh'

export function useRegrasComissao() {
  const { usuario } = useAuth()
  return useQuery({
    queryKey: ['rh', 'regras_comissao', usuario?.empresa_id],
    enabled: !!usuario,
    queryFn: async (): Promise<RhRegraComissao[]> => {
      const { data, error } = await supabase.from('rh_regras_comissao')
        .select('*, faixas:rh_faixas_comissao(*)')
        .eq('empresa_id', usuario!.empresa_id)
        .order('nome')
      if (error) throw error
      return (data ?? []) as unknown as RhRegraComissao[]
    },
  })
}

export function useCriarRegraComissao() {
  const { usuario } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      faixas,
      ...regra
    }: Omit<RhRegraComissao, 'id' | 'empresa_id' | 'created_at' | 'updated_at'> & {
      faixas: Omit<RhFaixaComissao, 'id' | 'regra_id' | 'created_at'>[]
    }) => {
      const { data: novaRegra, error: errRegra } = await supabase.from('rh_regras_comissao')
        .insert({ ...regra, empresa_id: usuario!.empresa_id })
        .select().single()
      if (errRegra || !novaRegra) throw errRegra

      if (faixas.length > 0) {
        const { error: errFaixas } = await supabase.from('rh_faixas_comissao')
          .insert(faixas.map(f => ({ ...f, regra_id: novaRegra.id })))
        if (errFaixas) throw errFaixas
      }

      return novaRegra
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rh', 'regras_comissao'] }),
  })
}

export function useAtualizarRegraComissao() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      faixas,
      ...regra
    }: Partial<RhRegraComissao> & {
      id: string
      faixas?: Omit<RhFaixaComissao, 'id' | 'regra_id' | 'created_at'>[]
    }) => {
      const { error } = await supabase.from('rh_regras_comissao').update(regra).eq('id', id)
      if (error) throw error

      if (faixas !== undefined) {
        await supabase.from('rh_faixas_comissao').delete().eq('regra_id', id)
        if (faixas.length > 0) {
          await supabase.from('rh_faixas_comissao').insert(faixas.map(f => ({ ...f, regra_id: id })))
        }
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rh', 'regras_comissao'] }),
  })
}

export function useExcluirRegraComissao() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('rh_regras_comissao').update({ ativa: false }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rh', 'regras_comissao'] }),
  })
}
