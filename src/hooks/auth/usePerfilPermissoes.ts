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
  const ehCustomizado = usuario?.perfil === 'customizado'

  // Perfis fixos: overrides de perfil_permissoes (só roda quando NÃO é
  // customizado — evita ir a uma tabela que não tem nada útil pra esse caso).
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
    enabled: !!usuario && !ehCustomizado,
    staleTime: 60_000,
  })

  // Perfil customizado: overrides de perfil_customizado_permissoes, remapeados
  // para o mesmo formato de chave `customizado:${id}:${acao}` que
  // resolverPermissao espera (ver permissaoResolver.ts).
  const queryCustomizado = useQuery({
    queryKey: ['perfil-customizado-permissoes', usuario?.perfil_customizado_id],
    queryFn: async (): Promise<OverrideRow[]> => {
      const { data, error } = await supabase
        .from('perfil_customizado_permissoes')
        .select('acao, permitido')
        .eq('perfil_customizado_id', usuario!.perfil_customizado_id!)
      if (error) throw error
      return (data ?? []).map((row) => ({
        perfil: `customizado:${usuario!.perfil_customizado_id}`,
        acao: row.acao,
        permitido: row.permitido,
      }))
    },
    enabled: !!usuario && ehCustomizado && !!usuario.perfil_customizado_id,
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

  const overrides = construirMapaOverrides(ehCustomizado ? (queryCustomizado.data ?? []) : (query.data ?? []))
  const overridesUsuario = construirMapaOverridesUsuario(queryIndividual.data ?? [])

  function pode(acao: Acao): boolean {
    if (!usuario) return false
    return resolverPermissao(usuario.perfil, acao, overrides, overridesUsuario, usuario.perfil_customizado_id)
  }

  return {
    pode,
    carregando: query.isLoading || queryCustomizado.isLoading || queryIndividual.isLoading,
    erro: query.error ?? queryCustomizado.error ?? queryIndividual.error,
  }
}
