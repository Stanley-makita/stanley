'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { type ProcessoCorretor } from '@/types/processos'
import { toast } from 'sonner'

export function useProcessoCorretores(processoId: string) {
  return useQuery({
    queryKey: ['processos', processoId, 'corretores'],
    queryFn: async (): Promise<ProcessoCorretor[]> => {
      const { data, error } = await supabase
        .from('processo_corretores')
        .select('*')
        .eq('processo_id', processoId)
        .order('principal', { ascending: false })
        .order('created_at', { ascending: true })
      if (error) throw error
      return data
    },
    enabled: !!processoId,
  })
}

export function useAdicionarCorretor(processoId: string) {
  const qc = useQueryClient()
  const { usuario } = useAuth()

  return useMutation({
    mutationFn: async (input: {
      pessoa_id: string | null
      nome: string
      telefone: string | null
      principal: boolean
    }) => {
      // Se vai ser principal, remover o principal atual
      if (input.principal) {
        await supabase
          .from('processo_corretores')
          .update({ principal: false })
          .eq('processo_id', processoId)
      }
      const { error } = await supabase
        .from('processo_corretores')
        .insert({ ...input, processo_id: processoId, empresa_id: usuario!.empresa_id })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['processos', processoId, 'corretores'] })
      qc.invalidateQueries({ queryKey: ['processos', processoId] })
      toast.success('Corretor adicionado.')
    },
    onError: () => toast.error('Erro ao adicionar corretor.'),
  })
}

export function useDefinirCorretorPrincipal(processoId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (corretorId: string) => {
      await supabase
        .from('processo_corretores')
        .update({ principal: false })
        .eq('processo_id', processoId)
      const { error } = await supabase
        .from('processo_corretores')
        .update({ principal: true })
        .eq('id', corretorId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['processos', processoId, 'corretores'] })
      qc.invalidateQueries({ queryKey: ['processos', processoId] })
    },
    onError: () => toast.error('Erro ao definir corretor principal.'),
  })
}

export function useRemoverCorretor(processoId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (corretorId: string) => {
      const { error } = await supabase
        .from('processo_corretores')
        .delete()
        .eq('id', corretorId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['processos', processoId, 'corretores'] })
      qc.invalidateQueries({ queryKey: ['processos', processoId] })
    },
    onError: () => toast.error('Erro ao remover corretor.'),
  })
}

export function useAtualizarImobiliaria(processoId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (imobiliariaId: string | null) => {
      const { error } = await supabase
        .from('processos')
        .update({ imobiliaria_id: imobiliariaId })
        .eq('id', processoId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['processos', processoId] })
    },
    onError: () => toast.error('Erro ao atualizar imobiliária.'),
  })
}
