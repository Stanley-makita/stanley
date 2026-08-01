'use client'

// Hooks de gestão de Corretores / Imobiliárias-Construtoras / Parceiros
// comerciais — mesmo padrão de useRegistrosImoveis.ts (React Query + Supabase
// client direto, sem API route; enforcement é via RLS escopada por empresa_id,
// ver migration 20260801_229). Exclusão é sempre lógica (ativo:false) — essas
// tabelas não têm coluna deleted_at.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useUsuarioAtual } from '@/hooks/useUsuarioAtual'
import type { Corretor, Imobiliaria, Parceiro } from '@/types/parceiros'

type NovaImobiliaria = Omit<Imobiliaria, 'id' | 'empresa_id' | 'criado_em' | 'atualizado_em'>
type NovoCorretor    = Omit<Corretor, 'id' | 'empresa_id' | 'criado_em' | 'atualizado_em' | 'imobiliaria'>
type NovoParceiro    = Omit<Parceiro, 'id' | 'empresa_id' | 'criado_em' | 'atualizado_em'>

// ── Imobiliárias / Construtoras ─────────────────────────────────────────────

export function useTodasImobiliarias() {
  const supabase = createClient()
  const { data: usuario } = useUsuarioAtual()

  return useQuery({
    queryKey: ['imobiliarias-todas', usuario?.empresa_id],
    enabled: !!usuario?.empresa_id,
    queryFn: async (): Promise<Imobiliaria[]> => {
      const { data, error } = await supabase
        .from('imobiliarias')
        .select('*')
        .eq('empresa_id', usuario!.empresa_id)
        .order('nome')
      if (error) throw error
      return data ?? []
    },
    staleTime: 60_000,
  })
}

export function useImobiliarias() {
  const supabase = createClient()
  const { data: usuario } = useUsuarioAtual()

  return useQuery({
    queryKey: ['imobiliarias', usuario?.empresa_id],
    enabled: !!usuario?.empresa_id,
    queryFn: async (): Promise<Imobiliaria[]> => {
      const { data, error } = await supabase
        .from('imobiliarias')
        .select('*')
        .eq('empresa_id', usuario!.empresa_id)
        .eq('ativo', true)
        .order('nome')
      if (error) throw error
      return data ?? []
    },
    staleTime: 120_000,
  })
}

export function useCriarImobiliaria() {
  const supabase = createClient()
  const { data: usuario } = useUsuarioAtual()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (dados: NovaImobiliaria) => {
      const { data, error } = await supabase
        .from('imobiliarias')
        .insert({ ...dados, empresa_id: usuario!.empresa_id })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['imobiliarias', usuario?.empresa_id] })
      queryClient.invalidateQueries({ queryKey: ['imobiliarias-todas', usuario?.empresa_id] })
    },
  })
}

export function useAtualizarImobiliaria() {
  const supabase = createClient()
  const { data: usuario } = useUsuarioAtual()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...dados }: Partial<Imobiliaria> & { id: string }) => {
      const { data, error } = await supabase
        .from('imobiliarias')
        .update({ ...dados, atualizado_em: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['imobiliarias', usuario?.empresa_id] })
      queryClient.invalidateQueries({ queryKey: ['imobiliarias-todas', usuario?.empresa_id] })
    },
  })
}

export function useExcluirImobiliaria() {
  const supabase = createClient()
  const { data: usuario } = useUsuarioAtual()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('imobiliarias').update({ ativo: false }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['imobiliarias', usuario?.empresa_id] })
      queryClient.invalidateQueries({ queryKey: ['imobiliarias-todas', usuario?.empresa_id] })
    },
  })
}

// ── Corretores ───────────────────────────────────────────────────────────────

export function useTodosCorretores() {
  const supabase = createClient()
  const { data: usuario } = useUsuarioAtual()

  return useQuery({
    queryKey: ['corretores-todos', usuario?.empresa_id],
    enabled: !!usuario?.empresa_id,
    queryFn: async (): Promise<Corretor[]> => {
      const { data, error } = await supabase
        .from('corretores')
        .select('*, imobiliaria:imobiliarias(id, nome, tipo)')
        .eq('empresa_id', usuario!.empresa_id)
        .order('nome')
      if (error) throw error
      return (data ?? []) as unknown as Corretor[]
    },
    staleTime: 60_000,
  })
}

export function useCriarCorretor() {
  const supabase = createClient()
  const { data: usuario } = useUsuarioAtual()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (dados: NovoCorretor) => {
      const { data, error } = await supabase
        .from('corretores')
        .insert({ ...dados, empresa_id: usuario!.empresa_id })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['corretores-todos', usuario?.empresa_id] })
    },
  })
}

export function useAtualizarCorretor() {
  const supabase = createClient()
  const { data: usuario } = useUsuarioAtual()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...dados }: Partial<Corretor> & { id: string }) => {
      const { imobiliaria: _imobiliaria, ...campos } = dados
      const { data, error } = await supabase
        .from('corretores')
        .update({ ...campos, atualizado_em: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['corretores-todos', usuario?.empresa_id] })
    },
  })
}

export function useExcluirCorretor() {
  const supabase = createClient()
  const { data: usuario } = useUsuarioAtual()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('corretores').update({ ativo: false }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['corretores-todos', usuario?.empresa_id] })
    },
  })
}

// ── Parceiros comerciais ─────────────────────────────────────────────────────

export function useTodosParceiros() {
  const supabase = createClient()
  const { data: usuario } = useUsuarioAtual()

  return useQuery({
    queryKey: ['parceiros-todos', usuario?.empresa_id],
    enabled: !!usuario?.empresa_id,
    queryFn: async (): Promise<Parceiro[]> => {
      const { data, error } = await supabase
        .from('parceiros')
        .select('*')
        .eq('empresa_id', usuario!.empresa_id)
        .order('nome')
      if (error) throw error
      return data ?? []
    },
    staleTime: 60_000,
  })
}

export function useCriarParceiro() {
  const supabase = createClient()
  const { data: usuario } = useUsuarioAtual()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (dados: NovoParceiro) => {
      const { data, error } = await supabase
        .from('parceiros')
        .insert({ ...dados, empresa_id: usuario!.empresa_id })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parceiros-todos', usuario?.empresa_id] })
    },
  })
}

export function useAtualizarParceiro() {
  const supabase = createClient()
  const { data: usuario } = useUsuarioAtual()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...dados }: Partial<Parceiro> & { id: string }) => {
      const { data, error } = await supabase
        .from('parceiros')
        .update({ ...dados, atualizado_em: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parceiros-todos', usuario?.empresa_id] })
    },
  })
}

export function useExcluirParceiro() {
  const supabase = createClient()
  const { data: usuario } = useUsuarioAtual()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('parceiros').update({ ativo: false }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parceiros-todos', usuario?.empresa_id] })
    },
  })
}
