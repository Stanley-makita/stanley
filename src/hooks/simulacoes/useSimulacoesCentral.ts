'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface SimulacaoCentral {
  id: string
  empresa_id: string
  tipo: 'custas' | 'financiamento' | 'consorcio' | 'cgi'
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

// Histórico por tipo (Central de Simulações, visão por aba) — cada tipo tem
// seu próprio limite de 100 linhas, em vez de uma lista única misturando os
// 4 tipos, que deixava um tipo pouco usado sumir da lista se os outros 3
// lotassem o limite compartilhado.
export function useSimulacoesCentralPorTipo(tipo: SimulacaoCentral['tipo'], enabled = true) {
  return useQuery({
    queryKey: ['simulacoes-central', 'por-tipo', tipo],
    queryFn: async (): Promise<SimulacaoCentral[]> => {
      const { data, error } = await supabase
        .from('simulacoes_central')
        .select('*')
        .eq('tipo', tipo)
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      return (data ?? []) as SimulacaoCentral[]
    },
    enabled,
  })
}

export function useSimulacoesCentralPorProcesso(processoId: string | undefined, tipo?: SimulacaoCentral['tipo']) {
  return useQuery({
    queryKey: ['simulacoes-central-processo', processoId, tipo],
    queryFn: async (): Promise<SimulacaoCentral[]> => {
      let query = supabase
        .from('simulacoes_central')
        .select('*')
        .eq('processo_id', processoId!)
        .order('created_at', { ascending: false })
      if (tipo) query = query.eq('tipo', tipo)
      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as SimulacaoCentral[]
    },
    enabled: !!processoId,
  })
}

export interface EstatisticasSimulacoesCentral {
  total: number
  aguardando: number
  concluidas: number
}

const TIPOS: SimulacaoCentral['tipo'][] = ['financiamento', 'custas', 'consorcio', 'cgi']

export type EstatisticasPorTipo = Record<SimulacaoCentral['tipo'], EstatisticasSimulacoesCentral>

// Contagem por tipo — alimenta os 4 cards do dashboard da Central de
// Simulações. Mesma lógica de count via head:true da função acima, só que
// quebrada por tipo em vez de global.
export function useEstatisticasSimulacoesCentralPorTipo() {
  return useQuery({
    queryKey: ['simulacoes-central-stats', 'por-tipo'],
    queryFn: async (): Promise<EstatisticasPorTipo> => {
      const resultados = await Promise.all(
        TIPOS.map(async (tipo) => {
          const [totalRes, aguardandoRes] = await Promise.all([
            supabase.from('simulacoes_central').select('id', { count: 'exact', head: true }).eq('tipo', tipo),
            supabase.from('simulacoes_central').select('id', { count: 'exact', head: true }).eq('tipo', tipo).eq('status', 'aguardando'),
          ])
          if (totalRes.error) throw totalRes.error
          if (aguardandoRes.error) throw aguardandoRes.error
          const total = totalRes.count ?? 0
          const aguardando = aguardandoRes.count ?? 0
          return [tipo, { total, aguardando, concluidas: total - aguardando }] as const
        })
      )
      return Object.fromEntries(resultados) as EstatisticasPorTipo
    },
  })
}
