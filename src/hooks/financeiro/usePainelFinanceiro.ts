'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { type PainelFinanceiroKpis } from '@/types/financeiro'

export function usePainelFinanceiro(mes: number, ano: number) {
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['financeiro', 'painel', usuario?.empresa_id, mes, ano],
    queryFn: async (): Promise<PainelFinanceiroKpis> => {
      const { data, error } = await supabase
        .rpc('calcular_painel_financeiro', {
          p_empresa_id: usuario!.empresa_id,
          p_mes: mes,
          p_ano: ano,
        })
        .single()
      if (error) throw error
      return data as PainelFinanceiroKpis
    },
    staleTime: 1000 * 60 * 2,
    enabled: !!usuario,
  })
}
