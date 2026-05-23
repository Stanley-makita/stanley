'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { type LeadHistorico } from '@/types/leads'

export function useLeadHistorico(leadId: string, tipos?: string[]) {
  return useQuery({
    queryKey: ['leads', leadId, 'historico', tipos ?? 'todos'],
    queryFn: async (): Promise<LeadHistorico[]> => {
      let query = supabase
        .from('lead_historico')
        .select(`
          *,
          usuario:usuarios!usuario_id(nome),
          fase_anterior:fases!fase_anterior_id(nome),
          fase_nova:fases!fase_nova_id(nome)
        `)
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })

      if (tipos && tipos.length > 0) {
        query = query.in('tipo', tipos)
      }

      const { data, error } = await query
      if (error) throw error
      return data
    },
    enabled: !!leadId,
  })
}