'use client'

import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import type { PendenciaResumo } from './useSolicitacoesAbertasPorProcesso'

export function useSolicitacoesAbertasPorLead(leadId: string | undefined) {
  const { usuario } = useAuth()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['solicitacoes', 'abertas', 'lead', leadId],
    queryFn: async (): Promise<PendenciaResumo[]> => {
      const { data, error } = await supabase
        .from('solicitacoes_operacionais')
        .select('id, titulo, responsavel:usuarios!responsavel_id(nome)')
        .eq('empresa_id', usuario!.empresa_id)
        .eq('lead_id', leadId!)
        .not('status', 'in', '("concluido","cancelado")')
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as unknown as PendenciaResumo[]
    },
    enabled: !!leadId && !!usuario,
    staleTime: 30_000,
  })

  useEffect(() => {
    if (!leadId) return
    const channel = supabase
      .channel(`pendencias-lead-${leadId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'solicitacoes_operacionais', filter: `lead_id=eq.${leadId}` },
        () => queryClient.invalidateQueries({ queryKey: ['solicitacoes', 'abertas', 'lead', leadId] })
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [leadId, queryClient])

  return query
}
