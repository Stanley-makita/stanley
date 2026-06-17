'use client'

import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export function useEmailConfirmacao(processoId: string) {
  return useQuery({
    queryKey: ['email_confirmacao', processoId],
    queryFn: async () => {
      const { data } = await supabase
        .from('email_envios')
        .select('id, sent_at, confirmado_em, numero_protocolo, para_email, template')
        .eq('processo_id', processoId)
        .eq('status', 'enviado')
        .order('sent_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      return data
    },
    enabled: !!processoId,
  })
}

export interface EmailConfirmacao {
  id: string
  sent_at: string | null
  confirmado_em: string | null
  numero_protocolo: string | null
  para_email: string
  template: string | null
  confirmacao_ip: string | null
  confirmacao_user_agent: string | null
  corpo: string | null
}

export function useEmailConfirmacoes(processoId: string) {
  const queryClient = useQueryClient()
  const queryKey = ['email_confirmacoes', processoId]

  useEffect(() => {
    if (!processoId) return
    const channel = supabase
      .channel(`confirmacoes_${processoId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'email_envios', filter: `processo_id=eq.${processoId}` },
        () => queryClient.invalidateQueries({ queryKey }),
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [processoId]) // eslint-disable-line react-hooks/exhaustive-deps

  return useQuery({
    queryKey,
    queryFn: async () => {
      const { data } = await supabase
        .from('email_envios')
        .select('id, sent_at, confirmado_em, numero_protocolo, para_email, template, confirmacao_ip, confirmacao_user_agent, corpo')
        .eq('processo_id', processoId)
        .eq('status', 'enviado')
        .order('sent_at', { ascending: false })
      return (data ?? []) as EmailConfirmacao[]
    },
    enabled: !!processoId,
  })
}
