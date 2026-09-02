import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/auth/useAuth'

export function useSolicitacoesBadge() {
  const supabase = createClient()
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['solicitacoes', 'badge', usuario?.empresa_id],
    enabled: !!usuario,
    staleTime: 60_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<number> => {
      // Mesmo escopo padrão de useSolicitacoesFila (sem todasDaEmpresa): só as
      // solicitações atribuídas a este usuário — o que "Minha Fila Operacional"
      // mostra por padrão. Contar a empresa inteira aqui inflava o badge com
      // solicitações de outras pessoas, sem relação com "tenho algo pra fazer".
      const { count, error } = await supabase
        .from('solicitacoes_operacionais')
        .select('id', { count: 'exact', head: true })
        .eq('empresa_id', usuario!.empresa_id)
        .eq('responsavel_id', usuario!.id)
        .not('status', 'in', '("concluido","cancelado")')
        .is('deleted_at', null)

      if (error) return 0
      return count ?? 0
    },
  })
}
