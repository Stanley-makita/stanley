import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export function useExcluirDocumento(processoId: string) {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, storagePath }: { id: string; storagePath: string }) => {
      // 1. Remover do Storage
      const { error: storageError } = await supabase.storage
        .from('documentos')
        .remove([storagePath])
      if (storageError) throw storageError

      // 2. Remover metadados da tabela
      const { error: dbError } = await supabase
        .from('processo_documentos')
        .delete()
        .eq('id', id)
      if (dbError) throw dbError
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documentos', processoId] })
    },
  })
}