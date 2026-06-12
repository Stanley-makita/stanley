import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/auth/useAuth'

export function useLeadsBadge() {
  const supabase = createClient()
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['leads', 'badge', usuario?.id, usuario?.empresa_id],
    enabled: !!usuario,
    staleTime: 1000 * 60 * 5,
    refetchInterval: 1000 * 60 * 5,
    queryFn: async (): Promise<number> => {
      const uid = usuario!.id
      const eid = usuario!.empresa_id

      const [solRes, tarefaRes] = await Promise.all([
        supabase.from('solicitacoes_operacionais')
          .select('id', { count: 'exact', head: true })
          .eq('empresa_id', eid).eq('responsavel_id', uid)
          .not('status', 'in', '("concluido","cancelado")')
          .not('lead_id', 'is', null).is('deleted_at', null),

        supabase.from('lead_tarefas')
          .select('id', { count: 'exact', head: true })
          .eq('empresa_id', eid).eq('responsavel_id', uid)
          .eq('concluida', false).is('deleted_at', null),
      ])

      if (solRes.error || tarefaRes.error) return 0
      return (solRes.count ?? 0) + (tarefaRes.count ?? 0)
    },
  })
}
