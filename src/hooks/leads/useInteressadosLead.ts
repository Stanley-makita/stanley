'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Interessado } from '@/types/comunicacao'

export type { Interessado }

/** Lista os destinatários possíveis de comunicação manual de um Lead (comprador + corretores vinculados). */
export function useInteressadosLead(leadId: string, enabled = true) {
  return useQuery({
    queryKey: ['leads', leadId, 'interessados'],
    enabled: enabled && !!leadId,
    queryFn: async (): Promise<Interessado[]> => {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`/api/leads/${leadId}/interessados`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error ?? 'Falha ao carregar destinatários.')
      return body.interessados
    },
  })
}
