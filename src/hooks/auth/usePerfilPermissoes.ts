'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { type Acao } from '@/types/auth'
import { resolverPermissao, construirMapaOverrides, type OverrideRow } from './permissaoResolver'

export type { OverrideRow }
export { resolverPermissao, construirMapaOverrides }

export function usePerfilPermissoes() {
  const { usuario } = useAuth()

  const query = useQuery({
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

  const overrides = construirMapaOverrides(query.data ?? [])

  function pode(acao: Acao): boolean {
    if (!usuario) return false
    return resolverPermissao(usuario.perfil, acao, overrides)
  }

  return {
    pode,
    carregando: query.isLoading,
    erro: query.error,
  }
}
