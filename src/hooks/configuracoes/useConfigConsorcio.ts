'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { type FinConfigConsorcio } from '@/types/financeiro'
import { toast } from 'sonner'

export function useConfigConsorcio() {
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['config-consorcio', usuario?.empresa_id],
    enabled: !!usuario,
    queryFn: async (): Promise<FinConfigConsorcio[]> => {
      const { data, error } = await supabase
        .from('financeiro_config_consorcio')
        .select('*')
        .order('administradora_nome', { ascending: true, nullsFirst: true })
      if (error) throw error
      return data
    },
  })
}

export interface SalvarConfigConsorcioInput {
  id: string | null
  administradora_nome: string | null
  tipo_bem: string | null
  tipo_parcela: 'linear' | 'reduzida' | null
  data_vigencia_inicio: string | null
  data_vigencia_fim: string | null
  comissao_total_percentual: number
  comissao_comercial_percentual: number
  numero_parcelas_padrao: number
}

// Sem upsert por onConflict: a linha "geral" usa um índice único parcial
// (administradora_nome IS NULL), que o onConflict do PostgREST não resolve
// direito — update por id quando já existe, senão insert.
export function useSalvarConfigConsorcio() {
  const queryClient = useQueryClient()
  const { usuario } = useAuth()

  return useMutation({
    mutationFn: async (input: SalvarConfigConsorcioInput) => {
      if (input.id) {
        const { error } = await supabase
          .from('financeiro_config_consorcio')
          .update({
            administradora_nome: input.administradora_nome,
            tipo_bem: input.tipo_bem,
            tipo_parcela: input.tipo_parcela,
            data_vigencia_inicio: input.data_vigencia_inicio,
            data_vigencia_fim: input.data_vigencia_fim,
            comissao_total_percentual: input.comissao_total_percentual,
            comissao_comercial_percentual: input.comissao_comercial_percentual,
            numero_parcelas_padrao: input.numero_parcelas_padrao,
          })
          .eq('id', input.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('financeiro_config_consorcio')
          .insert({
            empresa_id: usuario!.empresa_id,
            administradora_nome: input.administradora_nome,
            tipo_bem: input.tipo_bem,
            tipo_parcela: input.tipo_parcela,
            data_vigencia_inicio: input.data_vigencia_inicio,
            data_vigencia_fim: input.data_vigencia_fim,
            comissao_total_percentual: input.comissao_total_percentual,
            comissao_comercial_percentual: input.comissao_comercial_percentual,
            numero_parcelas_padrao: input.numero_parcelas_padrao,
          })
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['config-consorcio', usuario?.empresa_id] })
      toast.success('Configuração de Consórcio salva.')
    },
    onError: () => toast.error('Erro ao salvar configuração de Consórcio.'),
  })
}

export function useExcluirConfigConsorcio() {
  const queryClient = useQueryClient()
  const { usuario } = useAuth()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('financeiro_config_consorcio')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['config-consorcio', usuario?.empresa_id] })
      toast.success('Configuração removida.')
    },
    onError: () => toast.error('Erro ao remover configuração.'),
  })
}
