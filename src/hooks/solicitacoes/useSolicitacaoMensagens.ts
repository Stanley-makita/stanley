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
      const mensagens = (data ?? []) as SolicitacaoMensagem[]

      // autor_id aponta pra auth.users (sem embed pra usuarios): nomes numa 2ª consulta,
      // pra mostrar quem respondeu mesmo quando não é nem quem pediu nem o responsável.
      const ids = Array.from(new Set(mensagens.map((m) => m.autor_id)))
      if (ids.length === 0) return mensagens
      const { data: usuarios } = await supabase.from('usuarios').select('id, nome').in('id', ids)
      const porId = new Map((usuarios ?? []).map((u) => [u.id as string, u as { id: string; nome: string }]))
      return mensagens.map((m) => ({ ...m, autor: porId.get(m.autor_id) ?? null }))
    },
    enabled: !!solicitacaoId,
    staleTime: 30_000,
  })
}
