import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { ProcessoDocumento } from '@/types/documentos'

export function useDocumentosProcesso(processoId: string) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['documentos', processoId],
    enabled: !!processoId,
    queryFn: async (): Promise<ProcessoDocumento[]> => {
      const { data, error } = await supabase
        .from('processo_documentos')
        .select('*, enviado_por_usuario:usuarios(nome)')
        .eq('processo_id', processoId)
        .order('criado_em', { ascending: false })
      if (error) throw error
      return (data as ProcessoDocumento[]) ?? []
    },
  })
}