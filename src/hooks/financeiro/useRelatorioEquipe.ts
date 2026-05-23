'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { type RelatorioComercial } from '@/types/financeiro'

export function useRelatorioEquipe(mes: number, ano: number) {
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['financeiro', 'relatorio-equipe', usuario?.empresa_id, mes, ano],
    queryFn: async (): Promise<RelatorioComercial[]> => {
      const { data, error } = await supabase.rpc('relatorio_equipe', {
        p_empresa_id: usuario!.empresa_id,
        p_mes: mes,
        p_ano: ano,
      })
      if (error) throw error
      return data
    },
    enabled: !!usuario,
  })
}