'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { type FinComissaoPagar, type FinStatusComissaoPagar } from '@/types/financeiro'
import { toast } from 'sonner'

export function useComissoesAPagar(fechamento_id: string | null | undefined) {
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['financeiro', 'comissoes_pagar', fechamento_id],
    queryFn: async (): Promise<FinComissaoPagar[]> => {
      const { data, error } = await supabase
        .from('financeiro_comissoes_pagar')
        .select(`
          *,
          funcionario:rh_funcionarios!funcionario_id(nome),
          usuario:usuarios!usuario_id(nome),
          regra:rh_regras_comissao!regra_id(nome)
        `)
        .eq('fechamento_id', fechamento_id!)
        .order('papel', { ascending: true })
        .order('valor_final', { ascending: false })
      if (error) throw error
      return data
    },
    enabled: !!usuario && !!fechamento_id,
  })
}

export function useAtualizarComissaoPagar() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      ajuste_manual,
      motivo_ajuste,
      status,
      data_pagamento,
      observacoes,
    }: {
      id: string
      ajuste_manual?: number
      motivo_ajuste?: string
      status?: FinStatusComissaoPagar
      data_pagamento?: string
      observacoes?: string
    }) => {
      const { error } = await supabase
        .from('financeiro_comissoes_pagar')
        .update({
          ...(ajuste_manual !== undefined && { ajuste_manual }),
          ...(status && { status }),
          ...(data_pagamento !== undefined && { data_pagamento }),
          ...(observacoes !== undefined && { observacoes }),
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financeiro', 'comissoes_pagar'] })
      toast.success('Comissão atualizada.')
    },
    onError: () => toast.error('Erro ao atualizar comissão.'),
  })
}

export function useAdicionarComissaoPagar() {
  const queryClient = useQueryClient()
  const { usuario } = useAuth()

  return useMutation({
    mutationFn: async (payload: Omit<FinComissaoPagar, 'id' | 'empresa_id' | 'valor_final' | 'created_at' | 'updated_at'>) => {
      const { error } = await supabase
        .from('financeiro_comissoes_pagar')
        .insert({ ...payload, empresa_id: usuario!.empresa_id })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financeiro', 'comissoes_pagar'] })
      toast.success('Comissão adicionada.')
    },
    onError: () => toast.error('Erro ao adicionar comissão.'),
  })
}

export function useRemoverComissaoPagar() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('financeiro_comissoes_pagar')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financeiro', 'comissoes_pagar'] })
      toast.success('Comissão removida.')
    },
    onError: () => toast.error('Erro ao remover comissão.'),
  })
}

export function useMarcarComissoesPagas() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ ids, data_pagamento }: { ids: string[]; data_pagamento: string }) => {
      const { error } = await supabase
        .from('financeiro_comissoes_pagar')
        .update({ status: 'paga', data_pagamento })
        .in('id', ids)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financeiro', 'comissoes_pagar'] })
      toast.success('Comissões marcadas como pagas.')
    },
    onError: () => toast.error('Erro ao marcar pagamento.'),
  })
}
