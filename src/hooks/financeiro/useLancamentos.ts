'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { type FinanceiroLancamento, type TipoLancamento } from '@/types/financeiro'
import { toast } from 'sonner'

export function useLancamentos(mes: number, ano: number) {
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['financeiro', 'lancamentos', usuario?.empresa_id, mes, ano],
    queryFn: async (): Promise<FinanceiroLancamento[]> => {
      const { data, error } = await supabase
        .from('financeiro_lancamentos')
        .select('*, usuario:usuarios!usuario_id(nome)')
        .eq('empresa_id', usuario!.empresa_id)
        .eq('competencia_mes', mes)
        .eq('competencia_ano', ano)
        .order('data_lancamento', { ascending: false })
      if (error) throw error
      return data
    },
    enabled: !!usuario,
  })
}

export function useAdicionarLancamento() {
  const queryClient = useQueryClient()
  const { usuario } = useAuth()

  return useMutation({
    mutationFn: async (input: {
      tipo: TipoLancamento
      categoria: string
      descricao: string
      valor: number
      data_lancamento: string
    }) => {
      const data = new Date(input.data_lancamento)
      const { error } = await supabase
        .from('financeiro_lancamentos')
        .insert({
          ...input,
          empresa_id: usuario!.empresa_id,
          usuario_id: usuario!.id,
          competencia_mes: data.getMonth() + 1,
          competencia_ano: data.getFullYear(),
        })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financeiro'] })
      toast.success('Lançamento registrado.', { className: 'border-l-4 border-l-[#C2AA6A] bg-[#E7E0C4] text-[#253B29]' })
    },
    onError: () => toast.error('Erro ao registrar lançamento.'),
  })
}

export function useRemoverLancamento() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('financeiro_lancamentos').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financeiro'] })
    },
    onError: () => toast.error('Erro ao remover lançamento.'),
  })
}