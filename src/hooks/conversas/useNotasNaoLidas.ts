'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'

const EPOCA_NUNCA_LIDO = '1970-01-01T00:00:00Z'

/** Conta notas internas de outros usuários criadas depois da última leitura registrada. */
export function useNotasNaoLidas(conversaId: string | undefined) {
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['notas-nao-lidas', conversaId, usuario?.id],
    enabled: !!conversaId && !!usuario,
    refetchInterval: 3000,
    queryFn: async (): Promise<number> => {
      const { data: leitura } = await supabase
        .from('notas_internas_leituras')
        .select('lido_ate')
        .eq('conversa_id', conversaId!)
        .eq('usuario_id', usuario!.id)
        .maybeSingle()

      const { count, error } = await supabase
        .from('notas_internas')
        .select('id', { count: 'exact', head: true })
        .eq('conversa_id', conversaId!)
        .neq('autor_id', usuario!.id)
        .gt('created_at', leitura?.lido_ate ?? EPOCA_NUNCA_LIDO)

      if (error) throw error
      return count ?? 0
    },
  })
}

export function useMarcarNotasLidas(conversaId: string | undefined) {
  const queryClient = useQueryClient()
  const { usuario } = useAuth()

  return useMutation({
    mutationFn: async () => {
      if (!conversaId || !usuario) return
      const { error } = await supabase
        .from('notas_internas_leituras')
        .upsert({ conversa_id: conversaId, usuario_id: usuario.id, lido_ate: new Date().toISOString() })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notas-nao-lidas', conversaId, usuario?.id] })
    },
    onError: (error) => {
      console.error('[conversas] erro ao marcar notas como lidas:', error)
    },
  })
}
