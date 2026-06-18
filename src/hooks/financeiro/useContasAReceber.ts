'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import {
  type FinContaReceber,
  type FinNotaFiscal,
  type FinRecebimento,
  type FinStatusContaReceber,
} from '@/types/financeiro'
import { toast } from 'sonner'

export function useContasAReceber(fechamento_id: string | null | undefined) {
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['financeiro', 'contas_receber', fechamento_id],
    queryFn: async (): Promise<FinContaReceber[]> => {
      const { data, error } = await supabase
        .from('financeiro_contas_receber')
        .select(`
          *,
          banco:bancos!banco_id(nome, cor),
          notas_fiscais:financeiro_notas_fiscais(*),
          recebimentos:financeiro_recebimentos(*)
        `)
        .eq('fechamento_id', fechamento_id!)
        .order('data_prevista', { ascending: true })
      if (error) throw error
      return data
    },
    enabled: !!usuario && !!fechamento_id,
  })
}

export function useAdicionarContaReceber() {
  const queryClient = useQueryClient()
  const { usuario } = useAuth()

  return useMutation({
    mutationFn: async (payload: Omit<FinContaReceber, 'id' | 'empresa_id' | 'valor_recebido' | 'status' | 'created_at' | 'updated_at'>) => {
      const { error } = await supabase
        .from('financeiro_contas_receber')
        .insert({ ...payload, empresa_id: usuario!.empresa_id, origem: payload.origem ?? 'avulso' })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financeiro', 'contas_receber'] })
      toast.success('Conta a receber adicionada.')
    },
    onError: () => toast.error('Erro ao adicionar conta a receber.'),
  })
}

export function useAdicionarNotaFiscal() {
  const queryClient = useQueryClient()
  const { usuario } = useAuth()

  return useMutation({
    mutationFn: async (payload: Omit<FinNotaFiscal, 'id' | 'empresa_id' | 'status' | 'created_at'>) => {
      const { error } = await supabase
        .from('financeiro_notas_fiscais')
        .insert({ ...payload, empresa_id: usuario!.empresa_id })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financeiro', 'contas_receber'] })
      toast.success('Nota fiscal registrada.')
    },
    onError: () => toast.error('Erro ao registrar nota fiscal.'),
  })
}

export function useAdicionarRecebimento() {
  const queryClient = useQueryClient()
  const { usuario } = useAuth()

  return useMutation({
    mutationFn: async (payload: Omit<FinRecebimento, 'id' | 'empresa_id' | 'created_at'>) => {
      const { error } = await supabase
        .from('financeiro_recebimentos')
        .insert({ ...payload, empresa_id: usuario!.empresa_id })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financeiro', 'contas_receber'] })
      toast.success('Recebimento registrado.')
    },
    onError: () => toast.error('Erro ao registrar recebimento.'),
  })
}

export function useRemoverRecebimento() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('financeiro_recebimentos')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financeiro', 'contas_receber'] })
      toast.success('Recebimento removido.')
    },
    onError: () => toast.error('Erro ao remover recebimento.'),
  })
}

export function useAtualizarStatusConta() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: FinStatusContaReceber }) => {
      const { error } = await supabase
        .from('financeiro_contas_receber')
        .update({ status })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financeiro', 'contas_receber'] })
    },
    onError: () => toast.error('Erro ao atualizar status.'),
  })
}
