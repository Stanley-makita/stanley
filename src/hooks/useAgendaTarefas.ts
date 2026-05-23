import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useUsuarioAtual } from '@/hooks/useUsuarioAtual'
import { TarefaAgenda } from '@/types/agenda'
import { format, startOfMonth, endOfMonth, addMonths } from 'date-fns'

export function useAgendaTarefas(mes: Date, responsavelId?: string) {
  const supabase = createClient()
  const { data: usuario } = useUsuarioAtual()

  // Busca 3 meses (anterior + atual + próximo) para o calendário ter dados completos
  const dataInicio = format(startOfMonth(addMonths(mes, -1)), 'yyyy-MM-dd')
  const dataFim    = format(endOfMonth(addMonths(mes, 1)), 'yyyy-MM-dd')

  return useQuery({
    queryKey: ['agenda-tarefas', usuario?.empresa_id, dataInicio, dataFim, responsavelId],
    enabled: !!usuario?.empresa_id,
    queryFn: async (): Promise<TarefaAgenda[]> => {
      const { data, error } = await supabase.rpc('agenda_tarefas', {
        p_empresa_id:     usuario!.empresa_id,
        p_data_inicio:    dataInicio,
        p_data_fim:       dataFim,
        p_responsavel_id: responsavelId ?? null,
      })
      if (error) throw error
      return (data as TarefaAgenda[]) ?? []
    },
  })
}