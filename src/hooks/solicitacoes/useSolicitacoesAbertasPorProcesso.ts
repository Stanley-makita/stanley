'use client'

import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'

export interface PendenciaResumo {
  id: string
  titulo: string
  responsavel: { nome: string } | null
}

export function useSolicitacoesAbertasPorProcesso(processoId: string | undefined) {
  const { usuario } = useAuth()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['solicitacoes', 'abertas', 'processo', processoId],
    queryFn: async (): Promise<PendenciaResumo[]> => {
      const { data, error } = await supabase
        .from('solicitacoes_operacionais')
        .select('id, titulo, responsavel:usuarios!responsavel_id(nome)')
        .eq('empresa_id', usuario!.empresa_id)
        .eq('processo_id', processoId!)
        .not('status', 'in', '("concluido","cancelado")')
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as unknown as PendenciaResumo[]
    },
    enabled: !!processoId && !!usuario,
    staleTime: 30_000,
  })

  // Realtime: invalida quando solicitação deste processo é alterada
  useEffect(() => {
    if (!processoId) return

    const channel = supabase
      .channel(`pendencias-processo-${processoId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'solicitacoes_operacionais', filter: `processo_id=eq.${processoId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['solicitacoes', 'abertas', 'processo', processoId] })
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [processoId, queryClient])

  return query
}
