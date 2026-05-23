'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useUsuarioAtual } from '@/hooks/useUsuarioAtual'

export function usePersonalizacao() {
  const supabase = createClient()
  const { data: usuario } = useUsuarioAtual()

  return useQuery({
    queryKey: ['empresa-personalizacao', usuario?.empresa_id],
    enabled: !!usuario?.empresa_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('empresas')
        .select('id, nome, cnpj, telefone, email, site, logo_url')
        .eq('id', usuario!.empresa_id)
        .single()
      if (error) throw error
      return data
    },
    staleTime: 60_000,
  })
}
