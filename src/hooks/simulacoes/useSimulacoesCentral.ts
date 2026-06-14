'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface SimulacaoCentral {
  id: string
  empresa_id: string
  tipo: 'custas' | 'financiamento'
  status: 'aguardando' | 'concluida'
  nome_cliente: string | null
  cpf_cliente: string | null
  banco: string | null
  responsavel_id: string | null
  resultado_json: Record<string, unknown> | null
  lead_id: string | null
  processo_id: string | null
  created_at: string
}

export function useSimulacoesCentral() {
  return useQuery({
    queryKey: ['simulacoes-central'],
    queryFn: async (): Promise<SimulacaoCentral[]> => {
      const { data, error } = await supabase
        .from('simulacoes_central')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      return (data ?? []) as SimulacaoCentral[]
    },
  })
}
