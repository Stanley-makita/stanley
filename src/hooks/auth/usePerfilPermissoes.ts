'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { type Acao } from '@/types/auth'
import {
  resolverPermissao, construirMapaOverrides, construirMapaOverridesUsuario,
  type OverrideRow, type UsuarioOverrideRow,
} from './permissaoResolver'

export type { OverrideRow, UsuarioOverrideRow }
export { resolverPermissao, construirMapaOverrides, construirMapaOverridesUsuario }

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

  // Exceções individuais do próprio usuário logado — camada acima do
  // override de perfil (ver resolverPermissao). Escopada só ao próprio id,
  // então o mapa não carrega exceções de outras pessoas da empresa.
  const queryIndividual = useQuery({
    queryKey: ['usuario-permissoes', usuario?.id],
    queryFn: async (): Promise<UsuarioOverrideRow[]> => {
      const { data, error } = await supabase
        .from('usuario_permissoes')
        .select('acao, permitido')
        .eq('usuario_id', usuario!.id)
      if (error) throw error
      return data ?? []
    },
    enabled: !!usuario,
    staleTime: 60_000,
  })

  const overrides = construirMapaOverrides(query.data ?? [])
  const overridesUsuario = construirMapaOverridesUsuario(queryIndividual.data ?? [])

  function pode(acao: Acao): boolean {
    if (!usuario) return false
    return resolverPermissao(usuario.perfil, acao, overrides, overridesUsuario)
  }

  return {
    pode,
    carregando: query.isLoading || queryIndividual.isLoading,
    erro: query.error ?? queryIndividual.error,
  }
}
