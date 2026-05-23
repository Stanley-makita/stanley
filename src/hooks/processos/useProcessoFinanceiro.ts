'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import type { ProcessoFinanceiro } from '@/types/processos'

export function useProcessoFinanceiro(processoId: string) {
  return useQuery({
    queryKey: ['processo-financeiro', processoId],
    queryFn: async (): Promise<ProcessoFinanceiro[]> => {
      const { data, error } = await supabase
        .from('processo_financeiro')
        .select('*')
        .eq('processo_id', processoId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
    enabled: !!processoId,
  })
}

export function useCriarLancamento(processoId: string) {
  const { usuario } = useAuth()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (payload: {
      descricao: string
      tipo: ProcessoFinanceiro['tipo']
      valor: number
      situacao: ProcessoFinanceiro['situacao']
      observacao: string | null
    }) => {
      const { data, error } = await supabase
        .from('processo_financeiro')
        .insert({
          empresa_id:  usuario!.empresa_id,
          processo_id: processoId,
          criado_por:  (await supabase.auth.getUser()).data.user?.id ?? null,
          pago_em: payload.situacao === 'pago' ? new Date().toISOString() : null,
          ...payload,
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['processo-financeiro', processoId] }),
  })
}

export function useAtualizarLancamento(processoId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (payload: {
      id: string
      descricao?: string
      tipo?: ProcessoFinanceiro['tipo']
      valor?: number
      situacao?: ProcessoFinanceiro['situacao']
      observacao?: string | null
      pago_em?: string | null
    }) => {
      const { id, ...rest } = payload
      const update: Record<string, unknown> = { ...rest, updated_at: new Date().toISOString() }

      // Se marcando como pago e pago_em não foi explicitamente passado, define agora
      if (rest.situacao === 'pago' && !('pago_em' in rest)) {
        update.pago_em = new Date().toISOString()
      }

      const { error } = await supabase
        .from('processo_financeiro')
        .update(update)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['processo-financeiro', processoId] }),
  })
}

export function useExcluirLancamento(processoId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('processo_financeiro')
        .update({ situacao: 'cancelado', updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['processo-financeiro', processoId] }),
  })
}
