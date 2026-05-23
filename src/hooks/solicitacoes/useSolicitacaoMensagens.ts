'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { SolicitacaoMensagem } from '@/types/solicitacoes-operacionais'

export function useSolicitacaoMensagens(solicitacaoId: string | undefined) {
  return useQuery({
    queryKey: ['solicitacao-mensagens', solicitacaoId],
    queryFn: async (): Promise<SolicitacaoMensagem[]> => {
      const { data, error } = await supabase
        .from('solicitacao_mensagens')
        .select('id, autor_id, texto, created_at')
        .eq('solicitacao_id', solicitacaoId!)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as SolicitacaoMensagem[]
    },
    enabled: !!solicitacaoId,
    staleTime: 30_000,
  })
}
