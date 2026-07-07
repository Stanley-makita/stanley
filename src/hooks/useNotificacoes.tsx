'use client'

import { useEffect, useMemo } from 'react'
import { useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useUsuarioAtual } from '@/hooks/useUsuarioAtual'
import { Notificacao, NOTIFICACAO_META, DURACAO_POR_SEVERIDADE } from '@/types/notificacoes'
import { ToastNotificacao } from '@/components/notificacoes/ToastNotificacao'

// Mapa genérico tipo de notificação -> query keys a invalidar (prefix match).
// Novo evento futuro = uma linha nova aqui, sem mexer no handler do canal.
const INVALIDACOES_POR_TIPO: Partial<Record<Notificacao['tipo'], QueryKey[]>> = {
  tarefa_atribuida: [['agenda-tarefas'], ['agenda', 'badge'], ['leads', 'badge'], ['dashboard']],
  tarefa_vencida: [['agenda-tarefas'], ['agenda', 'badge'], ['dashboard']],
  lead_atribuido: [['leads', 'todos'], ['leads', 'fase'], ['leads', 'badge'], ['dashboard']],
  fase_avancada: [['dashboard']],
  processo_emitido: [['dashboard']],
  solicitacao_atribuida: [['leads', 'badge'], ['solicitacoes']],
  solicitacao_retorno: [['leads', 'badge'], ['solicitacoes']],
  solicitacao_respondida: [['solicitacoes']],
}

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

  // Realtime: INSERT dispara toast + invalidação; UPDATE/DELETE (ex.: marcar
  // como lida ou excluir em outra aba) só invalidam, para refletir sem F5.
  // Depende de REPLICA IDENTITY FULL (migration 20260706_150) para o filtro
  // por usuario_id funcionar em UPDATE/DELETE.
  useEffect(() => {
    if (!usuario?.id) return

    const channelName = `notificacoes-${usuario.id}`

    // Remove canais stale com o mesmo nome antes de criar (evita erro no Strict Mode)
    supabase.getChannels()
      .filter((c) => c.topic === `realtime:${channelName}`)
      .forEach((c) => supabase.removeChannel(c))

    const invalidar = () => queryClient.invalidateQueries({ queryKey: ['notificacoes', usuario.id] })

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
          invalidar()

          const nova = payload.new as Notificacao

          // Atualização em tempo real de badges/listas (sem esperar polling)
          const keys = INVALIDACOES_POR_TIPO[nova.tipo] ?? []
          keys.forEach((queryKey) => queryClient.invalidateQueries({ queryKey }))

          const meta = NOTIFICACAO_META[nova.tipo]
          const severidade = nova.severidade ?? meta.severidadePadrao
          const duracaoMs = DURACAO_POR_SEVERIDADE[severidade]

          toast.custom(
            (id) => <ToastNotificacao toastId={id} notificacao={nova} duracaoMs={duracaoMs} />,
            { duration: duracaoMs }
          )
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notificacoes', filter: `usuario_id=eq.${usuario.id}` },
        invalidar
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'notificacoes', filter: `usuario_id=eq.${usuario.id}` },
        invalidar
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
