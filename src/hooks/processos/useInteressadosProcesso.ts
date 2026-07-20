'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Interessado } from '@/types/comunicacao'

export type { Interessado }

/** Lista os destinatários possíveis de comunicação manual de um Negócio (comprador(es) +
 * corretor/parceiro/imobiliária/construtora vinculados). Espelha useInteressadosLead.ts. */
export function useInteressadosProcesso(processoId: string, enabled = true) {
  return useQuery({
    queryKey: ['processos', processoId, 'interessados'],
    enabled: enabled && !!processoId,
    queryFn: async (): Promise<Interessado[]> => {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`/api/processos/${processoId}/interessados`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error ?? 'Falha ao carregar destinatários.')
      return body.interessados
    },
  })
}
