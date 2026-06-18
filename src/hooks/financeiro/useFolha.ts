'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { type FinFolha, type FinFolhaItem, type FinStatusPagamentoItem } from '@/types/financeiro'
import { toast } from 'sonner'

export function useFolha(fechamento_id: string | null | undefined) {
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['financeiro', 'folha', fechamento_id],
    queryFn: async (): Promise<FinFolha | null> => {
      const { data, error } = await supabase
        .from('financeiro_folhas')
        .select(`
          *,
          itens:financeiro_folha_itens(
            *,
            funcionario:rh_funcionarios!funcionario_id(nome, cargo:rh_cargos!cargo_id(nome))
          )
        `)
        .eq('fechamento_id', fechamento_id!)
        .maybeSingle()
      if (error) throw error
      return data
    },
    enabled: !!usuario && !!fechamento_id,
  })
}

export function useAtualizarFolhaItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      ...campos
    }: Partial<FinFolhaItem> & { id: string }) => {
      const { error } = await supabase
        .from('financeiro_folha_itens')
        .update(campos)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financeiro', 'folha'] })
      toast.success('Item da folha atualizado.')
    },
    onError: () => toast.error('Erro ao atualizar item da folha.'),
  })
}

export function useMarcarItemPago() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      data_pagamento,
    }: {
      id: string
      data_pagamento: string
    }) => {
      const { error } = await supabase
        .from('financeiro_folha_itens')
        .update({ status_pagamento: 'pago' as FinStatusPagamentoItem, data_pagamento })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financeiro', 'folha'] })
      toast.success('Pagamento registrado.')
    },
    onError: () => toast.error('Erro ao registrar pagamento.'),
  })
}

export function useFecharFolha() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (folha_id: string) => {
      const { error } = await supabase
        .from('financeiro_folhas')
        .update({ status: 'fechada' })
        .eq('id', folha_id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financeiro', 'folha'] })
      toast.success('Folha fechada.')
    },
    onError: () => toast.error('Erro ao fechar folha.'),
  })
}
