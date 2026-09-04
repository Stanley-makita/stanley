'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { type Acao, type PerfilAcesso } from '@/types/auth'

/** Todos os perfis customizados da empresa (ativos e inativos) — a UI decide o que filtrar. */
export function usePerfisCustomizados() {
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['perfis-acesso', usuario?.empresa_id],
    queryFn: async (): Promise<PerfilAcesso[]> => {
      const { data, error } = await supabase
        .from('perfis_acesso')
        .select('*')
        .eq('empresa_id', usuario!.empresa_id)
        .order('nome')
      if (error) throw error
      return data ?? []
    },
    enabled: !!usuario,
    staleTime: 60_000,
  })
}

export function useCriarPerfilCustomizado() {
  const { usuario } = useAuth()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (nome: string): Promise<PerfilAcesso> => {
      const { data, error } = await supabase
        .from('perfis_acesso')
        .insert({ empresa_id: usuario!.empresa_id, nome, created_by: usuario!.id })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['perfis-acesso', usuario?.empresa_id] }),
  })
}

export function useRenomearPerfilCustomizado() {
  const { usuario } = useAuth()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, nome }: { id: string; nome: string }) => {
      const { error } = await supabase.from('perfis_acesso').update({ nome }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['perfis-acesso', usuario?.empresa_id] }),
  })
}

export function useDesativarPerfilCustomizado() {
  const { usuario } = useAuth()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('perfis_acesso').update({ ativo: false }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['perfis-acesso', usuario?.empresa_id] }),
  })
}

/** Matriz atual (linhas cruas) de um perfil customizado — usado pela tela de edição da matriz. */
export function useOverridesPerfilCustomizado(perfilCustomizadoId: string | null) {
  return useQuery({
    queryKey: ['perfil-customizado-permissoes', 'admin', perfilCustomizadoId],
    queryFn: async (): Promise<{ acao: Acao; permitido: boolean }[]> => {
      const { data, error } = await supabase
        .from('perfil_customizado_permissoes')
        .select('acao, permitido')
        .eq('perfil_customizado_id', perfilCustomizadoId!)
      if (error) throw error
      return data ?? []
    },
    enabled: !!perfilCustomizadoId,
    staleTime: 60_000,
  })
}

export function useSalvarPlanoCustomizado() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      perfilCustomizadoId, upserts, deletes,
    }: { perfilCustomizadoId: string; upserts: { acao: Acao; permitido: boolean }[]; deletes: Acao[] }) => {
      if (upserts.length > 0) {
        const { error } = await supabase
          .from('perfil_customizado_permissoes')
          .upsert(
            upserts.map((o) => ({
              perfil_customizado_id: perfilCustomizadoId,
              acao: o.acao,
              permitido: o.permitido,
              updated_at: new Date().toISOString(),
            })),
            { onConflict: 'perfil_customizado_id,acao' },
          )
        if (error) throw error
      }

      if (deletes.length > 0) {
        const { error } = await supabase
          .from('perfil_customizado_permissoes')
          .delete()
          .eq('perfil_customizado_id', perfilCustomizadoId)
          .in('acao', deletes)
        if (error) throw error
      }
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['perfil-customizado-permissoes', 'admin', variables.perfilCustomizadoId] })
      qc.invalidateQueries({ queryKey: ['perfil-customizado-permissoes', variables.perfilCustomizadoId] })
    },
  })
}
