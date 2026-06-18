'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import {
  type FinDespesa,
  type FinDespesaRecorrente,
  type FinStatusDespesa,
} from '@/types/financeiro'
import { toast } from 'sonner'

export function useDespesas(fechamento_id: string | null | undefined) {
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['financeiro', 'despesas', fechamento_id],
    queryFn: async (): Promise<FinDespesa[]> => {
      const { data, error } = await supabase
        .from('financeiro_despesas')
        .select('*')
        .eq('fechamento_id', fechamento_id!)
        .order('data_vencimento', { ascending: true })
      if (error) throw error
      return data
    },
    enabled: !!usuario && !!fechamento_id,
  })
}

export function useDespesasRecorrentes() {
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['financeiro', 'despesas_recorrentes', usuario?.empresa_id],
    queryFn: async (): Promise<FinDespesaRecorrente[]> => {
      const { data, error } = await supabase
        .from('financeiro_despesas_recorrentes')
        .select('*')
        .eq('empresa_id', usuario!.empresa_id)
        .order('descricao', { ascending: true })
      if (error) throw error
      return data
    },
    enabled: !!usuario,
  })
}

export function useAdicionarDespesa() {
  const queryClient = useQueryClient()
  const { usuario } = useAuth()

  return useMutation({
    mutationFn: async (payload: Omit<FinDespesa, 'id' | 'empresa_id' | 'created_at' | 'updated_at'>) => {
      const { error } = await supabase
        .from('financeiro_despesas')
        .insert({ ...payload, empresa_id: usuario!.empresa_id })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financeiro', 'despesas'] })
      toast.success('Despesa adicionada.')
    },
    onError: () => toast.error('Erro ao adicionar despesa.'),
  })
}

export function useAtualizarDespesa() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...campos }: Partial<FinDespesa> & { id: string }) => {
      const { error } = await supabase
        .from('financeiro_despesas')
        .update(campos)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financeiro', 'despesas'] })
      toast.success('Despesa atualizada.')
    },
    onError: () => toast.error('Erro ao atualizar despesa.'),
  })
}

export function useMarcarDespesaPaga() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, data_pagamento }: { id: string; data_pagamento: string }) => {
      const { error } = await supabase
        .from('financeiro_despesas')
        .update({ status: 'paga' as FinStatusDespesa, data_pagamento })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financeiro', 'despesas'] })
      toast.success('Despesa marcada como paga.')
    },
    onError: () => toast.error('Erro ao marcar despesa.'),
  })
}

export function useRemoverDespesa() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('financeiro_despesas')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financeiro', 'despesas'] })
      toast.success('Despesa removida.')
    },
    onError: () => toast.error('Erro ao remover despesa.'),
  })
}

export function useSalvarDespesaRecorrente() {
  const queryClient = useQueryClient()
  const { usuario } = useAuth()

  return useMutation({
    mutationFn: async (payload: Omit<FinDespesaRecorrente, 'id' | 'empresa_id' | 'created_at' | 'updated_at'>) => {
      const { error } = await supabase
        .from('financeiro_despesas_recorrentes')
        .insert({ ...payload, empresa_id: usuario!.empresa_id })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financeiro', 'despesas_recorrentes'] })
      toast.success('Despesa recorrente salva.')
    },
    onError: () => toast.error('Erro ao salvar despesa recorrente.'),
  })
}
