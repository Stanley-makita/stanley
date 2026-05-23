'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { type ResumoEstoque, type PerformanceBanco } from '@/types/processos'

export function useResumoEstoque() {
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['processos', 'resumo-estoque', usuario?.empresa_id],
    queryFn: async (): Promise<{ resumo: ResumoEstoque; bancos: PerformanceBanco[] }> => {
      const [resumoRes, bancosRes] = await Promise.all([
        supabase.rpc('resumo_estoque', { p_empresa_id: usuario!.empresa_id }),
        supabase.rpc('performance_por_banco', {
          p_empresa_id: usuario!.empresa_id,
          p_mes: new Date().getMonth() + 1,
          p_ano: new Date().getFullYear(),
        }),
      ])

      if (resumoRes.error) throw resumoRes.error
      if (bancosRes.error) throw bancosRes.error

      return { resumo: resumoRes.data, bancos: bancosRes.data }
    },
    staleTime: 1000 * 60 * 5,
    enabled: !!usuario,
  })
}