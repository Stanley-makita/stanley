'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { type KpisFinanceiro } from '@/types/financeiro'

export function useKpisFinanceiro(mes: number, ano: number) {
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['financeiro', 'kpis', usuario?.empresa_id, mes, ano],
    queryFn: async (): Promise<KpisFinanceiro> => {
      const { data, error } = await supabase.rpc('calcular_kpis_financeiro', {
        p_empresa_id: usuario!.empresa_id,
        p_mes: mes,
        p_ano: ano,
      })
      if (error) throw error
      return data
    },
    staleTime: 1000 * 60 * 2,
    enabled: !!usuario,
  })
}