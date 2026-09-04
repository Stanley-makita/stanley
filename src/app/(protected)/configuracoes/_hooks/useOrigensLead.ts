'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/auth/useAuth'
import { gerarCodigoUnico } from './origensLeadHelpers'

const supabase = createClient()

export interface OrigemLead {
  id: string
  empresa_id: string
  codigo: string
  nome: string
  sistema: boolean
  ativo: boolean
  created_at: string
  updated_at: string
}

/** Origens ativas da empresa — usado pelos dropdowns de preenchimento manual. */
export function useOrigensLead() {
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['origens-lead', usuario?.empresa_id],
    queryFn: async (): Promise<OrigemLead[]> => {
      const { data, error } = await supabase
        .from('origens_lead')
        .select('*')
        .eq('empresa_id', usuario!.empresa_id)
        .eq('ativo', true)
        .order('nome')
      if (error) throw error
      return data ?? []
    },
    enabled: !!usuario,
    staleTime: 60_000,
  })
}

/** Todas as origens da empresa (ativas e inativas) — só a tela de administração usa. */
export function useTodasOrigensLead() {
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['origens-lead', 'todas', usuario?.empresa_id],
    queryFn: async (): Promise<OrigemLead[]> => {
      const { data, error } = await supabase
        .from('origens_lead')
        .select('*')
        .eq('empresa_id', usuario!.empresa_id)
        .order('sistema', { ascending: false })
        .order('nome')
      if (error) throw error
      return data ?? []
    },
    enabled: !!usuario,
    staleTime: 60_000,
  })
}

export function useCriarOrigemLead() {
  const { usuario } = useAuth()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (nome: string): Promise<OrigemLead> => {
      if (!usuario?.empresa_id) throw new Error('Usuário não autenticado')

      const { data: existentes, error: erroExistentes } = await supabase
        .from('origens_lead')
        .select('codigo')
        .eq('empresa_id', usuario.empresa_id)
      if (erroExistentes) throw erroExistentes

      const codigo = gerarCodigoUnico(nome, (existentes ?? []).map((o) => o.codigo))

      const { data, error } = await supabase
        .from('origens_lead')
        .insert({ empresa_id: usuario.empresa_id, codigo, nome, sistema: false, ativo: true })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['origens-lead'] }),
  })
}

/** Renomear funciona tanto pras automáticas (sistema=true) quanto pras manuais — só o nome muda, nunca o codigo. */
export function useRenomearOrigemLead() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, nome }: { id: string; nome: string }) => {
      const { error } = await supabase.from('origens_lead').update({ nome }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['origens-lead'] }),
  })
}

export function useDesativarOrigemLead() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (origem: OrigemLead) => {
      if (origem.sistema) {
        throw new Error('Origens automáticas não podem ser desativadas — só renomeadas.')
      }
      const { error } = await supabase.from('origens_lead').update({ ativo: false }).eq('id', origem.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['origens-lead'] }),
  })
}

export function useReativarOrigemLead() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('origens_lead').update({ ativo: true }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['origens-lead'] }),
  })
}
