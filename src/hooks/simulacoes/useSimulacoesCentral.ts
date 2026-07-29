'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface SimulacaoCentral {
  id: string
  empresa_id: string
  tipo: 'custas' | 'financiamento' | 'consorcio'
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

export interface EstatisticasSimulacoesCentral {
  total: number
  aguardando: number
  concluidas: number
}

// Contagem real via COUNT do banco — os cards de resumo (Total/Aguardando/
// Concluídas) não podem derivar do array de useSimulacoesCentral, que é
// limitado a 100 linhas (só pra listar o histórico); acima de 100
// simulações o "Total" ficava travado em 100 (bug real, 2026-07-29).
export function useEstatisticasSimulacoesCentral() {
  return useQuery({
    queryKey: ['simulacoes-central-stats'],
    queryFn: async (): Promise<EstatisticasSimulacoesCentral> => {
      const [totalRes, aguardandoRes, concluidasRes] = await Promise.all([
        supabase.from('simulacoes_central').select('id', { count: 'exact', head: true }),
        supabase.from('simulacoes_central').select('id', { count: 'exact', head: true }).eq('status', 'aguardando'),
        supabase.from('simulacoes_central').select('id', { count: 'exact', head: true }).eq('status', 'concluida'),
      ])
      if (totalRes.error) throw totalRes.error
      if (aguardandoRes.error) throw aguardandoRes.error
      if (concluidasRes.error) throw concluidasRes.error
      return {
        total: totalRes.count ?? 0,
        aguardando: aguardandoRes.count ?? 0,
        concluidas: concluidasRes.count ?? 0,
      }
    },
  })
}
