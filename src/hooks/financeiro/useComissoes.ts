'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { type Comissao, type StatusComissao } from '@/types/financeiro'
import { toast } from 'sonner'

interface FiltrosComissoes {
  mes: number
  ano: number
  status?: StatusComissao | 'todos'
  comercial_id?: string
}

export function useComissoes(filtros: FiltrosComissoes) {
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['financeiro', 'comissoes', usuario?.empresa_id, filtros],
    queryFn: async (): Promise<Comissao[]> => {
      let query = supabase
        .from('comissoes')
        .select(`
          *,
          processo:processos!processo_id(numero_processo, nome_imovel, banco:bancos!banco_id(nome, cor)),
          comercial:usuarios!comercial_id(nome)
        `)
        .eq('empresa_id', usuario!.empresa_id)
        .eq('competencia_mes', filtros.mes)
        .eq('competencia_ano', filtros.ano)
        .order('data_emissao', { ascending: false })

      if (filtros.status && filtros.status !== 'todos') {
        query = query.eq('status', filtros.status)
      }
      if (filtros.comercial_id) {
        query = query.eq('comercial_id', filtros.comercial_id)
      }

      const { data, error } = await query
      if (error) throw error
      return data
    },
    enabled: !!usuario,
  })
}

export function useAtualizarComissao() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, status, data_recebimento, observacao }: {
      id: string
      status: StatusComissao
      data_recebimento?: string
      observacao?: string
    }) => {
      const { error } = await supabase
        .from('comissoes')
        .update({ status, data_recebimento: data_recebimento ?? null, observacao: observacao ?? null })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financeiro'] })
      toast.success('Comissão atualizada.', { className: 'border-l-4 border-l-fonti-accent bg-fonti-accent-hover text-fonti-primary' })
    },
    onError: () => toast.error('Erro ao atualizar comissão.'),
  })
}