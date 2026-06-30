import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { CatalogoTipoDocumento, DominioDocumento } from '@/types/documentos'

export function useCatalogoTiposDocumento(dominio?: DominioDocumento) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['catalogo-tipos-documento', dominio ?? 'todos'],
    staleTime: 1000 * 60 * 30,
    queryFn: async (): Promise<CatalogoTipoDocumento[]> => {
      let query = supabase
        .from('catalogo_tipos_documento')
        .select('*')
        .eq('ativo', true)
        .order('ordem_exibicao', { ascending: true })

      if (dominio) {
        query = query.contains('dominio_permitido', [dominio])
      }

      const { data, error } = await query
      if (error) throw error
      return (data as CatalogoTipoDocumento[]) ?? []
    },
  })
}
