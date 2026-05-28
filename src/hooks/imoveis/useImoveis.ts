'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useUsuarioAtual } from '@/hooks/useUsuarioAtual'
import type { Imovel } from '@/types/imoveis'

const PAGE_SIZE = 24

export interface FiltrosImoveis {
  search?: string
  tipo?: string
  categoria?: string
  cidade?: string
  pagina?: number
}

export function useImoveis(filtros: FiltrosImoveis = {}) {
  const supabase = createClient()
  const { data: usuario } = useUsuarioAtual()
  const { search = '', tipo, categoria, cidade, pagina = 1 } = filtros

  return useQuery({
    queryKey: ['imoveis', usuario?.empresa_id, filtros],
    enabled: !!usuario?.empresa_id,
    queryFn: async (): Promise<{ imoveis: Imovel[]; total: number }> => {
      let query = supabase
        .from('imoveis')
        .select('*, registro_imoveis:registros_imoveis(id, nome, cidade, uf)', { count: 'exact' })
        .eq('empresa_id', usuario!.empresa_id)
        .is('deleted_at', null)

      if (search.trim().length >= 2) {
        query = query.or(
          `matricula.ilike.%${search}%,rua.ilike.%${search}%,bairro.ilike.%${search}%,cidade.ilike.%${search}%`
        )
      }
      if (tipo) query = query.eq('tipo', tipo)
      if (categoria) query = query.eq('categoria', categoria)
      if (cidade) query = query.ilike('cidade', `%${cidade}%`)

      const from = (pagina - 1) * PAGE_SIZE
      const { data, error, count } = await query
        .order('created_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1)

      if (error) throw error
      return { imoveis: (data ?? []) as Imovel[], total: count ?? 0 }
    },
    staleTime: 30_000,
  })
}

export function useImovel(id: string) {
  const supabase = createClient()
  const { data: usuario } = useUsuarioAtual()

  return useQuery({
    queryKey: ['imovel', id],
    enabled: !!id && !!usuario?.empresa_id,
    queryFn: async (): Promise<Imovel> => {
      const { data, error } = await supabase
        .from('imoveis')
        .select('*, registro_imoveis:registros_imoveis(id, nome, cidade, uf)')
        .eq('id', id)
        .eq('empresa_id', usuario!.empresa_id)
        .is('deleted_at', null)
        .single()
      if (error) throw error
      return data as Imovel
    },
  })
}

export function useBuscarImoveis(query: string) {
  const supabase = createClient()
  const { data: usuario } = useUsuarioAtual()

  return useQuery({
    queryKey: ['imoveis', 'busca', usuario?.empresa_id, query],
    enabled: !!usuario?.empresa_id && query.trim().length >= 2,
    queryFn: async (): Promise<Imovel[]> => {
      const { data, error } = await supabase
        .from('imoveis')
        .select('*, registro_imoveis:registros_imoveis(id, nome)')
        .eq('empresa_id', usuario!.empresa_id)
        .is('deleted_at', null)
        .or(
          `matricula.ilike.%${query}%,rua.ilike.%${query}%,bairro.ilike.%${query}%,cidade.ilike.%${query}%`
        )
        .order('created_at', { ascending: false })
        .limit(20)
      if (error) throw error
      return (data ?? []) as Imovel[]
    },
    staleTime: 30_000,
  })
}

type ImovelInput = Omit<Imovel, 'id' | 'empresa_id' | 'created_at' | 'updated_at' | 'deleted_at' | 'registro_imoveis' | 'ultimo_processo'>

export function useCriarImovel() {
  const supabase = createClient()
  const { data: usuario } = useUsuarioAtual()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (dados: ImovelInput) => {
      const { data, error } = await supabase
        .from('imoveis')
        .insert({ ...dados, empresa_id: usuario!.empresa_id })
        .select()
        .single()
      if (error) throw error
      return data as Imovel
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['imoveis', usuario?.empresa_id] })
    },
  })
}

export function useAtualizarImovel() {
  const supabase = createClient()
  const { data: usuario } = useUsuarioAtual()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...dados }: Partial<ImovelInput> & { id: string }) => {
      const { data, error } = await supabase
        .from('imoveis')
        .update({ ...dados, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as Imovel
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['imoveis', usuario?.empresa_id] })
      queryClient.invalidateQueries({ queryKey: ['imovel', vars.id] })
    },
  })
}

export function useExcluirImovel() {
  const supabase = createClient()
  const { data: usuario } = useUsuarioAtual()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('imoveis')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['imoveis', usuario?.empresa_id] })
    },
  })
}
