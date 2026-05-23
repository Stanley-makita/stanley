import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useUsuarioAtual } from '@/hooks/useUsuarioAtual'
import { MetaEquipe } from '@/types/configuracoes-avancadas'

export function useSalvarMeta() {
  const supabase = createClient()
  const { data: usuario } = useUsuarioAtual()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (meta: Omit<MetaEquipe, 'id' | 'empresa_id'>) => {
      const { error } = await supabase
        .from('metas_equipe')
        .upsert({
          empresa_id:     usuario!.empresa_id,
          ano:            meta.ano,
          mes:            meta.mes,
          meta_valor:     meta.meta_valor,
          meta_corte:     meta.meta_corte,
          meta_plus:      meta.meta_plus,
          meta_contratos: meta.meta_contratos,
        }, { onConflict: 'empresa_id,ano,mes' })
      if (error) throw error
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['metas-equipe', usuario?.empresa_id, variables.ano] })
    },
  })
}