import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useUsuarioAtual } from '@/hooks/useUsuarioAtual'

/**
 * Exclui uma notificação do usuário atual. Funciona via DELETE direto do
 * client (sem RPC) porque a policy `usuario_exclui_propria_notificacao`
 * (migration 20260706_150) libera DELETE para `usuario_id = auth.uid()` —
 * diferente do INSERT, que continua bloqueado e só passa pela RPC
 * `criar_notificacao`.
 */
export function useExcluirNotificacao() {
  const supabase = createClient()
  const { data: usuario } = useUsuarioAtual()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('notificacoes').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notificacoes', usuario?.id] })
    },
  })
}
