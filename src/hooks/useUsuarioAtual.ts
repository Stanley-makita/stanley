import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export interface UsuarioAtual {
  id: string
  nome: string
  email: string
  perfil: 'admin' | 'gerente' | 'comercial' | 'operacional' | 'suporte'
  empresa_id: string
  ativo: boolean
  avatar_url: string | null
}

export function useUsuarioAtual() {
  const supabase = createClient()

  return useQuery({
    queryKey: ['usuario-atual'],
    queryFn: async (): Promise<UsuarioAtual> => {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) throw new Error('Não autenticado')

      const { data, error } = await supabase
        .from('usuarios')
        .select('id, nome, email, perfil, empresa_id, ativo, avatar_url')
        .eq('id', user.id)
        .single()

      if (error) throw error
      return data as UsuarioAtual
    },
    staleTime: 5 * 60 * 1000,
  })
}
