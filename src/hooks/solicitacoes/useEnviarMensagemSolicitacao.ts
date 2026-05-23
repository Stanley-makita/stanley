'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

export function useEnviarMensagemSolicitacao() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ solicitacaoId, texto }: { solicitacaoId: string; texto: string }) => {
      const { error } = await supabase.rpc('enviar_mensagem_solicitacao', {
        p_solicitacao_id: solicitacaoId,
        p_texto: texto,
      })
      if (error) throw error
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['solicitacoes'] })
      queryClient.invalidateQueries({ queryKey: ['solicitacao-mensagens', variables.solicitacaoId] })
      toast.success('Mensagem enviada.', {
        className: 'border-l-4 border-l-[#C2AA6A] bg-[#E7E0C4] text-[#253B29]',
      })
    },
  })
}
