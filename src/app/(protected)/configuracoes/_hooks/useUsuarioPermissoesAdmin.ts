'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { type Acao } from '@/types/auth'
import { type UsuarioOverrideRow } from '@/hooks/auth/permissaoResolver'

/**
 * Busca as exceções individuais já configuradas para UM usuário específico
 * (não o usuário logado — este é o hook usado pela tela de admin, dentro do
 * modal Editar Usuário, pra montar os 3 selects de "Permissões individuais"
 * daquela pessoa).
 */
export function useUsuarioPermissoes(usuarioId: string | undefined) {
  return useQuery({
    queryKey: ['usuario-permissoes', usuarioId],
    queryFn: async (): Promise<UsuarioOverrideRow[]> => {
      const { data, error } = await supabase
        .from('usuario_permissoes')
        .select('acao, permitido')
        .eq('usuario_id', usuarioId!)
      if (error) throw error
      return data ?? []
    },
    enabled: !!usuarioId,
    staleTime: 60_000,
  })
}

/**
 * Grava o plano de alterações de permissões individuais de um usuário —
 * mesmo formato de useSalvarPlano (perfil_permissoes): upsert para exceção
 * explícita, delete para "voltar a usar o padrão do perfil" (nunca deixa uma
 * linha redundante gravada).
 */
export function useSalvarPermissoesIndividuais() {
  const { usuario } = useAuth()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      usuarioId, upserts, deletes,
    }: { usuarioId: string; upserts: { acao: Acao; permitido: boolean }[]; deletes: Acao[] }) => {
      if (upserts.length > 0) {
        const { error } = await supabase
          .from('usuario_permissoes')
          .upsert(
            upserts.map((o) => ({
              empresa_id: usuario!.empresa_id,
              usuario_id: usuarioId,
              acao: o.acao,
              permitido: o.permitido,
              updated_at: new Date().toISOString(),
            })),
            { onConflict: 'usuario_id,acao' },
          )
        if (error) throw error
      }

      if (deletes.length > 0) {
        const { error } = await supabase
          .from('usuario_permissoes')
          .delete()
          .eq('usuario_id', usuarioId)
          .in('acao', deletes)
        if (error) throw error
      }
    },
    onSuccess: (_data, { usuarioId }) => {
      qc.invalidateQueries({ queryKey: ['usuario-permissoes', usuarioId] })
    },
  })
}
