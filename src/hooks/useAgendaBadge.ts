import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/auth/useAuth'
import { format } from 'date-fns'

export function useAgendaBadge() {
  const supabase = createClient()
  const { usuario } = useAuth()

  const hoje = format(new Date(), 'yyyy-MM-dd')
  const isGestorOuAdmin = usuario?.perfil === 'admin' || usuario?.perfil === 'gerente' || usuario?.perfil === 'gestor'

  return useQuery({
    queryKey: ['agenda', 'badge', usuario?.id, hoje],
    enabled: !!usuario,
    staleTime: 1000 * 60 * 5,
    refetchInterval: 1000 * 60 * 5,
    queryFn: async (): Promise<number> => {
      let query = supabase
        .from('processo_tarefas')
        .select('id', { count: 'exact', head: true })
        .eq('empresa_id', usuario!.empresa_id)
        .eq('concluida', false)
        .lte('vencimento', hoje)

      if (!isGestorOuAdmin) {
        query = query.eq('responsavel_id', usuario!.id)
      }

      const { count, error } = await query
      if (error) return 0
      return count ?? 0
    },
  })
}
