'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import type { StatusSolicitacao } from '@/types/solicitacoes-operacionais'

interface ResponderParams {
  id: string
  retorno_operacional: string
  status: StatusSolicitacao
  anexo_retorno_path?: string | null
}

export function useResponderSolicitacao() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, retorno_operacional, status, anexo_retorno_path }: ResponderParams) => {
      const { error } = await supabase.rpc('responder_solicitacao', {
        p_id:         id,
        p_retorno:    retorno_operacional,
        p_status:     status,
        p_anexo_path: anexo_retorno_path ?? null,
      })
      if (error) throw error
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['solicitacoes'] })
      qc.invalidateQueries({ queryKey: ['solicitacao-mensagens', variables.id] })
      toast.success('Retorno salvo.', {
        className: 'border-l-4 border-l-[#C2AA6A] bg-[#E7E0C4] text-[#253B29]',
      })
    },
  })
}
