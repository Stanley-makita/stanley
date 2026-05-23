import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

interface DocumentoConversa {
  id: string
  storage_path: string
  mime_type: string | null
  nome_original: string
  created_at: string
  signedUrl?: string
}

export function useDocumentosConversa(conversaId: string | null | undefined) {
  return useQuery({
    queryKey: ['documentos-conversa', conversaId],
    enabled: !!conversaId,
    staleTime: 1000 * 60 * 5,
    queryFn: async (): Promise<DocumentoConversa[]> => {
      const { data, error } = await supabase
        .from('documentos_clientes')
        .select('id, storage_path, mime_type, nome_original, created_at')
        .eq('conversa_id', conversaId!)
        .order('created_at', { ascending: false })

      if (error) throw error
      if (!data || data.length === 0) return []

      // Gerar signed URLs em paralelo
      const comUrls = await Promise.all(
        data.map(async (doc) => {
          const { data: urlData } = await supabase.storage
            .from('documentos-clientes')
            .createSignedUrl(doc.storage_path, 3600)
          return { ...doc, signedUrl: urlData?.signedUrl }
        })
      )

      return comUrls
    },
  })
}
