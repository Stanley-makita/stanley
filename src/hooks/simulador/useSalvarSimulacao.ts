'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import type { ProcessoCustasSimulacao, ResultadoSimulador } from '@/types/simulador'

export function useHistoricoSimulacoes(processoId?: string, leadId?: string) {
  return useQuery({
    queryKey: ['custas-simulacoes', processoId, leadId],
    queryFn: async (): Promise<ProcessoCustasSimulacao[]> => {
      let query = supabase
        .from('processo_custas_simulacoes')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20)

      if (processoId) query = query.eq('processo_id', processoId)
      else if (leadId) query = query.eq('lead_id', leadId)

      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as ProcessoCustasSimulacao[]
    },
    enabled: !!(processoId || leadId),
  })
}

export function useSalvarSimulacao() {
  const { usuario } = useAuth()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (payload: {
      processoId?: string
      leadId?: string
      resultado: ResultadoSimulador
    }) => {
      const e = payload.resultado.entrada
      const { data, error } = await supabase
        .from('processo_custas_simulacoes')
        .insert({
          empresa_id: usuario!.empresa_id,
          processo_id: payload.processoId ?? null,
          lead_id: payload.leadId ?? null,
          criado_por: (await supabase.auth.getUser()).data.user?.id ?? null,
          valor_imovel: e.valorCV,
          valor_financiado: e.valorFinanciado,
          banco_nome: e.banco,
          municipio: e.cidade,
          tem_desconto_itbi: false,
          resultado_json: payload.resultado,
          total_custas: payload.resultado.totalSemDesconto,
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['custas-simulacoes', vars.processoId, vars.leadId] })
    },
  })
}
