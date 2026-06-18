'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { type FinConferencia } from '@/types/financeiro'
import { toast } from 'sonner'

export function useConferencias(fechamento_id: string | null | undefined) {
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['financeiro', 'conferencias', fechamento_id],
    queryFn: async (): Promise<FinConferencia[]> => {
      const { data, error } = await supabase
        .from('financeiro_conferencias')
        .select('*, resolvido_por_usuario:usuarios!resolvido_por(nome)')
        .eq('fechamento_id', fechamento_id!)
        .order('severidade', { ascending: false })
        .order('status', { ascending: true })
      if (error) throw error
      return data
    },
    enabled: !!usuario && !!fechamento_id,
  })
}

export function useResolverConferencia() {
  const queryClient = useQueryClient()
  const { usuario } = useAuth()

  return useMutation({
    mutationFn: async ({
      id,
      status,
      observacao,
    }: {
      id: string
      status: 'ok' | 'ignorada'
      observacao?: string
    }) => {
      const { error } = await supabase
        .from('financeiro_conferencias')
        .update({
          status,
          resolvido_por: usuario!.id,
          resolvido_em: new Date().toISOString(),
          ...(observacao !== undefined && { descricao: observacao }),
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financeiro', 'conferencias'] })
      toast.success('Conferência atualizada.')
    },
    onError: () => toast.error('Erro ao resolver conferência.'),
  })
}

export function useAjustes(fechamento_id: string | null | undefined) {
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['financeiro', 'ajustes', fechamento_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('financeiro_ajustes')
        .select('*, usuario:usuarios!criado_por(nome)')
        .eq('fechamento_id', fechamento_id!)
        .order('criado_em', { ascending: false })
      if (error) throw error
      return data
    },
    enabled: !!usuario && !!fechamento_id,
  })
}

export function useRegistrarAjuste() {
  const queryClient = useQueryClient()
  const { usuario } = useAuth()

  return useMutation({
    mutationFn: async ({
      fechamento_id,
      entidade_tipo,
      entidade_id,
      tipo_ajuste,
      valor_anterior,
      valor_novo,
      motivo,
    }: {
      fechamento_id: string
      entidade_tipo: string
      entidade_id: string
      tipo_ajuste: string
      valor_anterior?: string
      valor_novo?: string
      motivo: string
    }) => {
      const { error } = await supabase
        .from('financeiro_ajustes')
        .insert({
          empresa_id: usuario!.empresa_id,
          fechamento_id,
          entidade_tipo,
          entidade_id,
          tipo_ajuste,
          valor_anterior: valor_anterior ?? null,
          valor_novo: valor_novo ?? null,
          motivo,
          criado_por: usuario!.id,
        })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financeiro', 'ajustes'] })
    },
    onError: () => toast.error('Erro ao registrar ajuste.'),
  })
}
