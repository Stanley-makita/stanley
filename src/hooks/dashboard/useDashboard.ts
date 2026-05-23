'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import {
  type DashboardKpis,
  type ProcessoPorFase,
  type AtividadeItem,
} from '@/types/dashboard'

export function useDashboardKpis() {
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['dashboard', 'kpis', usuario?.empresa_id],
    queryFn: async (): Promise<DashboardKpis> => {
      const { data, error } = await supabase
        .rpc('dashboard_kpis')
        .eq('empresa_id', usuario!.empresa_id)
        .single()

      if (error) throw error
      return data as DashboardKpis
    },
    staleTime: 1000 * 60 * 5,
    enabled: !!usuario,
  })
}

export function useProcessosPorFase() {
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['dashboard', 'processos-por-fase', usuario?.empresa_id],
    queryFn: async (): Promise<ProcessoPorFase[]> => {
      const { data, error } = await supabase
        .rpc('dashboard_processos_por_fase', { p_empresa_id: usuario!.empresa_id })

      if (error) throw error
      return data ?? []
    },
    staleTime: 1000 * 60 * 5,
    enabled: !!usuario,
  })
}

export function useAtividadeRecente() {
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['dashboard', 'atividade', usuario?.empresa_id],
    queryFn: async (): Promise<AtividadeItem[]> => {
      const { data, error } = await supabase
        .from('lead_historico')
        .select('id, tipo, descricao, created_at, usuarios(nome)')
        .eq('empresa_id', usuario!.empresa_id)
        .order('created_at', { ascending: false })
        .limit(10)

      if (error) throw error

      return (data ?? []).map((row) => ({
        id: row.id as string,
        tipo: row.tipo as AtividadeItem['tipo'],
        descricao: row.descricao as string,
        usuario: (row.usuarios as unknown as { nome: string } | null)?.nome ?? '—',
        criadoEm: row.created_at as string,
      }))
    },
    staleTime: 1000 * 60 * 2,
    enabled: !!usuario,
  })
}

export function useMembrosAtivos() {
  const { usuario } = useAuth()

  // Este sempre usa dados reais — usuarios já existe
  return useQuery({
    queryKey: ['dashboard', 'membros', usuario?.empresa_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('usuarios')
        .select('id, nome, ativo')
        .eq('empresa_id', usuario!.empresa_id)
        .eq('ativo', true)
        .is('deleted_at', null)

      if (error) throw error
      return data
    },
    staleTime: 1000 * 60 * 10,
    enabled: !!usuario,
  })
}
