'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { isPast, parseISO } from 'date-fns'

export interface TarefaStatusLead {
  vencidas: number
  pendentes: number
  total: number
}

export function useLeadsTarefasStatus(): Map<string, TarefaStatusLead> {
  const { usuario } = useAuth()

  const { data } = useQuery({
    queryKey: ['leads', 'tarefas-status', usuario?.empresa_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lead_tarefas')
        .select('lead_id, data_prazo, concluida')
        .eq('empresa_id', usuario!.empresa_id)
        .is('deleted_at', null)
      if (error) throw error
      return data
    },
    enabled: !!usuario,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  })

  const map = new Map<string, TarefaStatusLead>()
  if (!data) return map

  for (const t of data) {
    const atual = map.get(t.lead_id) ?? { vencidas: 0, pendentes: 0, total: 0 }
    atual.total++
    if (!t.concluida) {
      const vencida =
        t.data_prazo != null &&
        isPast(parseISO(t.data_prazo + 'T23:59:59'))
      if (vencida) {
        atual.vencidas++
      } else {
        atual.pendentes++
      }
    }
    map.set(t.lead_id, atual)
  }

  return map
}
