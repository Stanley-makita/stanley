'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useUsuarioAtual } from '@/hooks/useUsuarioAtual'

interface PersonalizacaoUpdate {
  nome?: string
  cnpj?: string
  telefone?: string
  email?: string
  email_contato?: string
  site?: string
  logo_url?: string
  logo_path?: string
}

export function useSalvarPersonalizacao() {
  const supabase = createClient()
  const { data: usuario } = useUsuarioAtual()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (dados: PersonalizacaoUpdate) => {
      const { error } = await supabase
        .from('empresas')
        .update(dados)
        .eq('id', usuario!.empresa_id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['empresa-personalizacao'] })
    },
  })
}
