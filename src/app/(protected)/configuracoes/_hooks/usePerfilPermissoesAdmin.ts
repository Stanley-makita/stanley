'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { type Acao, type UsuarioPerfil } from '@/types/auth'
import { type OverrideRow } from '@/hooks/auth/permissaoResolver'

/**
 * Busca todos os overrides da empresa (todos os perfis) — mesma queryKey de
 * usePerfilPermissoes, então o cache é compartilhado (sem fetch duplicado).
 * Usado pela tela de configuração para montar/editar a matriz de qualquer
 * perfil, não só do usuário logado.
 */
export function useOverridesEmpresa() {
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['perfil-permissoes', usuario?.empresa_id],
    queryFn: async (): Promise<OverrideRow[]> => {
      const { data, error } = await supabase
        .from('perfil_permissoes')
        .select('perfil, acao, permitido')
        .eq('empresa_id', usuario!.empresa_id)
      if (error) throw error
      return data ?? []
    },
    enabled: !!usuario,
    staleTime: 60_000,
  })
}

/**
 * Salva o plano de alterações (ver planejarSalvamento): upserts para o que
 * realmente diverge do padrão, deletes para overrides que voltaram a bater
 * com o padrão (evita deixar uma linha redundante/travada no banco).
 * Se qualquer uma das duas etapas falhar, lança erro — nunca finge sucesso.
 */
export function useSalvarPlano() {
  const { usuario } = useAuth()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      perfil, upserts, deletes,
    }: { perfil: UsuarioPerfil; upserts: { acao: Acao; permitido: boolean }[]; deletes: Acao[] }) => {
      if (upserts.length > 0) {
        const { error } = await supabase
          .from('perfil_permissoes')
          .upsert(
            upserts.map((o) => ({
              empresa_id: usuario!.empresa_id,
              perfil,
              acao: o.acao,
              permitido: o.permitido,
              updated_at: new Date().toISOString(),
            })),
            { onConflict: 'empresa_id,perfil,acao' },
          )
        if (error) throw error
      }

      if (deletes.length > 0) {
        const { error } = await supabase
          .from('perfil_permissoes')
          .delete()
          .eq('empresa_id', usuario!.empresa_id)
          .eq('perfil', perfil)
          .in('acao', deletes)
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['perfil-permissoes', usuario?.empresa_id] })
    },
  })
}

/** Restaurar padrão: apaga todos os overrides daquele perfil nesta empresa — volta a cair 100% no PERMISSOES_PADRAO. */
export function useRestaurarPadrao() {
  const { usuario } = useAuth()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (perfil: UsuarioPerfil) => {
      const { error } = await supabase
        .from('perfil_permissoes')
        .delete()
        .eq('empresa_id', usuario!.empresa_id)
        .eq('perfil', perfil)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['perfil-permissoes', usuario?.empresa_id] })
    },
  })
}
