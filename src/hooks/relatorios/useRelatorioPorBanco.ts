import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useUsuarioAtual } from '@/hooks/useUsuarioAtual'
import { RelatorioBanco } from '@/types/relatorios'

export function useRelatorioPorBanco(dataInicio: string, dataFim: string) {
  const supabase = createClient()
  const { data: usuario } = useUsuarioAtual()

  return useQuery({
    queryKey: ['relatorio-por-banco', usuario?.empresa_id, dataInicio, dataFim],
    enabled: !!usuario?.empresa_id && !!dataInicio && !!dataFim,
    queryFn: async (): Promise<RelatorioBanco[]> => {
      const { data, error } = await supabase.rpc('relatorio_por_banco', {
        p_empresa_id: usuario!.empresa_id,
        p_data_inicio: dataInicio,
        p_data_fim: dataFim,
      })
      if (error) throw error
      return (data as RelatorioBanco[]) ?? []
    },
  })
}