'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { toast } from 'sonner'

export interface ConversaParticipante {
  id: string
  conversa_id: string
  usuario_id: string
  adicionado_em: string
  usuario: { nome: string; avatar_url: string | null } | null
}

export function useConversaParticipantes(conversaId: string | undefined) {
  return useQuery({
    queryKey: ['conversa-participantes', conversaId],
    enabled: !!conversaId,
    queryFn: async (): Promise<ConversaParticipante[]> => {
      const { data, error } = await supabase
        .from('conversa_participantes')
        // conversa_participantes tem 2 FKs pra usuarios (usuario_id e
        // adicionado_por) — precisa nomear qual usar, senão o PostgREST
        // recusa o embed por ambiguidade (PGRST201) e a query falha inteira.
        .select('id, conversa_id, usuario_id, adicionado_em, usuario:usuarios!usuario_id(nome, avatar_url)')
        .eq('conversa_id', conversaId!)
        .order('adicionado_em', { ascending: true })
      if (error) throw error
      return data as unknown as ConversaParticipante[]
    },
  })
}

export function useAdicionarParticipante(conversaId: string) {
  const queryClient = useQueryClient()
  const { usuario } = useAuth()

  return useMutation({
    mutationFn: async (usuarioId: string) => {
      const { error } = await supabase.from('conversa_participantes').insert({
        conversa_id: conversaId,
        usuario_id: usuarioId,
        empresa_id: usuario!.empresa_id,
        adicionado_por: usuario!.id,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversa-participantes', conversaId] })
      toast.success('Participante adicionado.')
    },
    onError: (error) => {
      console.error('[conversas] erro ao adicionar participante:', error)
      toast.error('Erro ao adicionar participante.')
    },
  })
}

export function useRemoverParticipante(conversaId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (participanteId: string) => {
      const { error } = await supabase
        .from('conversa_participantes')
        .delete()
        .eq('id', participanteId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversa-participantes', conversaId] })
    },
    onError: (error) => {
      console.error('[conversas] erro ao remover participante:', error)
      toast.error('Erro ao remover participante.')
    },
  })
}
