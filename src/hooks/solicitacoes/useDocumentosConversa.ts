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
      // Modelo definitivo: `documentos` não tem conversa_id — documentos pertencem à
      // Pessoa (acervo documental). Resolve a pessoa da conversa e busca o acervo dela.
      const { data: conversa } = await supabase
        .from('conversas')
        .select('pessoa_id')
        .eq('id', conversaId!)
        .maybeSingle()

      if (!conversa?.pessoa_id) return []

      const { data, error } = await supabase
        .from('documentos')
        .select('id, storage_path, mime_type, nome_original, created_at:recebido_em')
        .eq('dominio', 'acervo_documental')
        .eq('pessoa_id', conversa.pessoa_id)
        .is('deleted_at', null)
        .order('recebido_em', { ascending: false })

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
