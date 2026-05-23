import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useUsuarioAtual } from '@/hooks/useUsuarioAtual'
import { MetaEquipe } from '@/types/configuracoes-avancadas'

export function useMetas(ano: number) {
  const supabase = createClient()
  const { data: usuario } = useUsuarioAtual()

  return useQuery({
    queryKey: ['metas-equipe', usuario?.empresa_id, ano],
    enabled: !!usuario?.empresa_id,
    queryFn: async (): Promise<MetaEquipe[]> => {
      const { data, error } = await supabase
        .from('metas_equipe')
        .select('*')
        .eq('empresa_id', usuario!.empresa_id)
        .eq('ano', ano)
        .order('mes')
      if (error) throw error
      return (data as MetaEquipe[]) ?? []
    },
  })
}