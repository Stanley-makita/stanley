import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useUsuarioAtual } from '@/hooks/useUsuarioAtual'

export function useMarcarNotificacoesLidas() {
  const supabase = createClient()
  const { data: usuario } = useUsuarioAtual()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.rpc('marcar_notificacoes_lidas', {
        p_empresa_id: usuario!.empresa_id,
        p_ids: ids,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notificacoes', usuario?.id] })
    },
  })
}

export function useMarcarTodasLidas() {
  const supabase = createClient()
  const { data: usuario } = useUsuarioAtual()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('notificacoes')
        .update({ lida: true, lida_em: new Date().toISOString() })
        .eq('usuario_id', usuario!.id)
        .eq('lida', false)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notificacoes', usuario?.id] })
    },
  })
}