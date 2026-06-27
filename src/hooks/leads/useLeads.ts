'use client'

import { useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/auth/useAuth'
import { type Lead } from '@/types/leads'

export function useLeadsPorFase(faseId: string) {
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['leads', 'fase', faseId, usuario?.empresa_id],
    queryFn: async (): Promise<Lead[]> => {
      const { data, error } = await supabase
        .from('leads')
        .select(`
          *,
          responsavel:usuarios!responsavel_id(id, nome),
          responsavel_operacional:usuarios!responsavel_operacional_id(id, nome),
          fase:fases!fase_id(id, nome, cor),
          status:fase_statuses!status_id(id, nome, cor)
        `)
        .eq('empresa_id', usuario!.empresa_id)
        .eq('fase_id', faseId)
        .is('deleted_at', null)
        .order('ordem_kanban', { ascending: true })
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) throw error
      return data
    },
    enabled: !!usuario && !!faseId,
    refetchInterval: 30 * 1000,
  })
}

export function useLead(leadId: string) {
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['leads', leadId],
    queryFn: async (): Promise<Lead> => {
      const { data, error } = await supabase
        .from('leads')
        .select(`
          *,
          responsavel:usuarios!responsavel_id(id, nome),
          responsavel_operacional:usuarios!responsavel_operacional_id(id, nome),
          fase:fases!fase_id(id, nome, cor),
          status:fase_statuses!status_id(id, nome, cor),
          conjuge_pessoa:pessoas!conjuge_pessoa_id(id, nome, cpf, renda_formal, renda_informal),
          vendedor_pessoa:pessoas!vendedor_pessoa_id(id, nome, cpf),
          parceiro:parceiros!parceiro_id(id, nome, imobiliaria, tipo_parceiro)
        `)
        .eq('id', leadId)
        .eq('empresa_id', usuario!.empresa_id)
        .is('deleted_at', null)
        .single()

      if (error) throw error
      return data
    },
    enabled: !!usuario && !!leadId,
  })
}

export function useLeadsTodos(faseId?: string, search?: string) {
  const { usuario } = useAuth()
  const queryClient = useQueryClient()
  const supabaseClient = useMemo(() => createClient(), [])

  const query = useQuery({
    queryKey: ['leads', 'todos', usuario?.empresa_id, faseId, search],
    queryFn: async (): Promise<Lead[]> => {
      let q = supabase
        .from('leads')
        .select(`
          *,
          responsavel:usuarios!responsavel_id(id, nome),
          responsavel_operacional:usuarios!responsavel_operacional_id(id, nome),
          fase:fases!fase_id(id, nome, cor),
          status:fase_statuses!status_id(id, nome, cor)
        `)
        .eq('empresa_id', usuario!.empresa_id)
        .is('deleted_at', null)

      if (faseId) q = q.eq('fase_id', faseId)
      if (search && search.length >= 2) {
        q = q.or(`nome.ilike.%${search}%,telefone.ilike.%${search}%`)
      }

      const { data, error } = await q
        .order('created_at', { ascending: false })
        .limit(200)

      if (error) throw error
      return data as Lead[]
    },
    enabled: !!usuario,
    refetchInterval: 30 * 1000,
  })

  // Realtime: atualiza lista imediatamente quando Lead é inserido ou atualizado
  useEffect(() => {
    if (!usuario?.empresa_id) return

    const channelName = `leads-lista-${usuario.empresa_id}`

    supabaseClient.getChannels()
      .filter((c) => c.topic === `realtime:${channelName}`)
      .forEach((c) => supabaseClient.removeChannel(c))

    const channel = supabaseClient
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'leads',
          filter: `empresa_id=eq.${usuario.empresa_id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['leads', 'todos', usuario.empresa_id] })
          queryClient.invalidateQueries({ queryKey: ['leads', 'fase'] })
        },
      )
      .subscribe()

    return () => { supabaseClient.removeChannel(channel) }
  }, [usuario?.empresa_id, queryClient, supabaseClient])

  return query
}