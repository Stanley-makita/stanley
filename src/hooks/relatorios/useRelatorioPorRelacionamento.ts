import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useUsuarioAtual } from '@/hooks/useUsuarioAtual'
import { carregarProducaoRelacionamentos } from '@/lib/relatorios/producaoRelacionamentos'

export function useRelatorioPorRelacionamento(dataInicio: string, dataFim: string) {
  const { data: usuario, isPending: usuarioPendente, error: usuarioErro } = useUsuarioAtual()
  const consulta = useQuery({
    queryKey: ['relatorio-producao-relacionamentos', usuario?.empresa_id, usuario?.id, dataInicio, dataFim],
    enabled: !!usuario?.empresa_id && !!dataInicio && !!dataFim && dataInicio <= dataFim,
    queryFn: ({ signal }) => carregarProducaoRelacionamentos(
      createClient(), usuario!.empresa_id, dataInicio, dataFim, signal,
    ),
  })
  return {
    ...consulta,
    isLoading: usuarioPendente || consulta.isLoading,
    error: usuarioErro ?? consulta.error,
  }
}
