'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useUsuarioAtual } from '@/hooks/useUsuarioAtual'

export function useUsuariosEmpresa() {
  const supabase = createClient()
  const { data: usuario } = useUsuarioAtual()

  return useQuery({
    queryKey: ['usuarios-empresa', usuario?.empresa_id],
    enabled: !!usuario?.empresa_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('usuarios')
        .select('id, nome, email, perfil, avatar_url')
        .eq('empresa_id', usuario!.empresa_id)
        .eq('ativo', true)
        .is('deleted_at', null)
        .order('nome')
      if (error) throw error
      return data
    },
    staleTime: 60_000,
  })
}
