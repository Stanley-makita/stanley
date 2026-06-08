'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
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
          fase:fases!fase_id(id, nome, cor)
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
          fase:fases!fase_id(id, nome, cor)
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

  return useQuery({
    queryKey: ['leads', 'todos', usuario?.empresa_id, faseId, search],
    queryFn: async (): Promise<Lead[]> => {
      let query = supabase
        .from('leads')
        .select(`
          *,
          responsavel:usuarios!responsavel_id(id, nome),
          fase:fases!fase_id(id, nome, cor)
        `)
        .eq('empresa_id', usuario!.empresa_id)
        .is('deleted_at', null)

      if (faseId) query = query.eq('fase_id', faseId)
      if (search && search.length >= 2) {
        query = query.or(`nome.ilike.%${search}%,telefone.ilike.%${search}%`)
      }

      const { data, error } = await query
        .order('created_at', { ascending: false })
        .limit(200)

      if (error) throw error
      return data as Lead[]
    },
    enabled: !!usuario,
  })
}