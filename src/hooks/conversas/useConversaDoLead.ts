'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export function useConversaDoLead(leadId: string | undefined) {
  return useQuery({
    queryKey: ['conversa-do-lead', leadId],
    queryFn: async (): Promise<{ id: string } | null> => {
      const { data, error } = await supabase
        .from('conversas')
        .select('id')
        .eq('lead_id', leadId!)
        .eq('arquivada', false)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data
    },
    enabled: !!leadId,
    staleTime: 60_000,
  })
}
