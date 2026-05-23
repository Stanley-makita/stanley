import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useUsuarioAtual } from '@/hooks/useUsuarioAtual'
import { ComissaoPadrao } from '@/types/configuracoes-avancadas'

export function useComissoesPadrao() {
  const supabase = createClient()
  const { data: usuario } = useUsuarioAtual()

  return useQuery({
    queryKey: ['comissoes-padrao', usuario?.empresa_id],
    enabled: !!usuario?.empresa_id,
    queryFn: async (): Promise<ComissaoPadrao[]> => {
      const { data, error } = await supabase
        .from('comissoes_padrao')
        .select('*, banco:bancos(nome, cor)')
        .eq('empresa_id', usuario!.empresa_id)
        .order('banco(nome)')
      if (error) throw error
      return (data as ComissaoPadrao[]) ?? []
    },
  })
}