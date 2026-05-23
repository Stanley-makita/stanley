import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useUsuarioAtual } from '@/hooks/useUsuarioAtual'
import { ProducaoMensal } from '@/types/relatorios'

export function useRelatorioProducaoMensal(ano: number) {
  const supabase = createClient()
  const { data: usuario } = useUsuarioAtual()

  return useQuery({
    queryKey: ['relatorio-producao-mensal', usuario?.empresa_id, ano],
    enabled: !!usuario?.empresa_id,
    queryFn: async (): Promise<ProducaoMensal[]> => {
      const { data, error } = await supabase.rpc('relatorio_producao_mensal', {
        p_empresa_id: usuario!.empresa_id,
        p_ano: ano,
      })
      if (error) throw error
      return (data as ProducaoMensal[]) ?? []
    },
  })
}