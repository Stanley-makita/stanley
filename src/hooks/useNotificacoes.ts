'use client'

import { useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useUsuarioAtual } from '@/hooks/useUsuarioAtual'
import { Notificacao } from '@/types/notificacoes'

export function useNotificacoes(limite = 50) {
  const supabase = useMemo(() => createClient(), [])
  const { data: usuario } = useUsuarioAtual()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['notificacoes', usuario?.id, limite],
    enabled: !!usuario?.id,
    queryFn: async (): Promise<Notificacao[]> => {
      const { data, error } = await supabase
        .from('notificacoes')
        .select('*')
        .eq('usuario_id', usuario!.id)
        .order('criado_em', { ascending: false })
        .limit(limite)
      if (error) throw error
      return (data as Notificacao[]) ?? []
    },
  })

  // Realtime: escuta INSERT na tabela notificacoes filtrado pelo usuario_id
  useEffect(() => {
    if (!usuario?.id) return

    const channelName = `notificacoes-${usuario.id}`

    // Remove canais stale com o mesmo nome antes de criar (evita erro no Strict Mode)
    supabase.getChannels()
      .filter((c) => c.topic === `realtime:${channelName}`)
      .forEach((c) => supabase.removeChannel(c))

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notificacoes',
          filter: `usuario_id=eq.${usuario.id}`,
        },
        (payload) => {
          queryClient.invalidateQueries({ queryKey: ['notificacoes', usuario.id] })
          const nova = payload.new as Notificacao
          toast(nova.titulo, {
            description: nova.mensagem ?? undefined,
            duration: 5000,
            icon: '🔔',
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [usuario?.id, supabase, queryClient])

  return query
}

export function useNotificacoesNaoLidas() {
  const { data = [] } = useNotificacoes(100)
  return data.filter((n) => !n.lida)
}