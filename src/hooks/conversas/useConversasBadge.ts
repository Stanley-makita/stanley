import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/auth/useAuth'

export function useConversasBadge() {
  const supabase = createClient()
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['conversas', 'badge', usuario?.empresa_id],
    enabled: !!usuario,
    staleTime: 30_000,
    refetchInterval: 30_000,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('conversas')
        .select('id', { count: 'exact', head: true })
        .eq('empresa_id', usuario!.empresa_id)
        .eq('arquivada', false)
        .eq('bot_ativo', false)
        .neq('status', 'encerrado')

      if (error) return 0
      return count ?? 0
    },
  })
}
