'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { type FinConsorcioReceber, type FinConsorcioComercialPagar } from '@/types/financeiro'
import { toast } from 'sonner'

const SELECT_RECEBER = `
  *,
  processo:processos!processo_id(numero_processo, lead:leads!lead_id(nome)),
  processo_cota:processo_cotas!processo_cota_id(administradora_nome, grupo, cota)
`

const SELECT_COMERCIAL_PAGAR = `
  *,
  processo:processos!processo_id(numero_processo, lead:leads!lead_id(nome)),
  processo_cota:processo_cotas!processo_cota_id(administradora_nome, grupo, cota),
  usuario:usuarios!usuario_id(nome)
`

export function useConsorcioReceber() {
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['financeiro', 'consorcio_receber', usuario?.empresa_id],
    queryFn: async (): Promise<FinConsorcioReceber[]> => {
      const { data, error } = await supabase
        .from('financeiro_consorcio_receber')
        .select(SELECT_RECEBER)
        .order('data_vencimento', { ascending: true })
      if (error) throw error
      return data as unknown as FinConsorcioReceber[]
    },
    enabled: !!usuario,
  })
}

export function useConsorcioComercialPagar() {
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['financeiro', 'consorcio_comercial_pagar', usuario?.empresa_id],
    queryFn: async (): Promise<FinConsorcioComercialPagar[]> => {
      const { data, error } = await supabase
        .from('financeiro_consorcio_comercial_pagar')
        .select(SELECT_COMERCIAL_PAGAR)
        .order('data_vencimento', { ascending: true })
      if (error) throw error
      return data as unknown as FinConsorcioComercialPagar[]
    },
    enabled: !!usuario,
  })
}

export function useMarcarParcelaConsorcioRecebida() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, valor_recebido, data_recebimento }: { id: string; valor_recebido: number; data_recebimento: string }) => {
      const { error } = await supabase
        .from('financeiro_consorcio_receber')
        .update({ status: 'recebida', valor_recebido, data_recebimento })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financeiro', 'consorcio_receber'] })
      toast.success('Parcela marcada como recebida.')
    },
    onError: () => toast.error('Erro ao marcar parcela como recebida.'),
  })
}

export function useMarcarParcelaConsorcioPaga() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, valor_pago, data_pagamento }: { id: string; valor_pago: number; data_pagamento: string }) => {
      const { error } = await supabase
        .from('financeiro_consorcio_comercial_pagar')
        .update({ status: 'paga', valor_pago, data_pagamento })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financeiro', 'consorcio_comercial_pagar'] })
      toast.success('Parcela marcada como paga.')
    },
    onError: () => toast.error('Erro ao marcar parcela como paga.'),
  })
}
