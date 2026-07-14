import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { CatalogoPastaProcesso } from '@/types/documentos'

export function useCatalogoPastasProcesso() {
  const supabase = createClient()

  return useQuery({
    queryKey: ['catalogo-pastas-processo'],
    staleTime: 1000 * 60 * 30,
    queryFn: async (): Promise<CatalogoPastaProcesso[]> => {
      const { data, error } = await supabase
        .from('catalogo_pastas_processo')
        .select('*')
        .eq('ativo', true)
        .order('ordem_exibicao', { ascending: true })

      if (error) throw error
      return (data as CatalogoPastaProcesso[]) ?? []
    },
  })
}
