'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

/**
 * Exclui um processo aberto por engano (ex.: duplicado) — admin, ou perfil
 * liberado em processos.excluir (enforcement real via usuario_atual_pode no RPC).
 * Soft delete: Pessoa, documentos e lead do cliente continuam intactos.
 */
export function useExcluirProcesso(processoId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (motivo: string) => {
      const { error } = await supabase.rpc('excluir_processo', {
        p_processo_id: processoId,
        p_motivo: motivo,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processos'] })
      queryClient.invalidateQueries({ queryKey: ['negocios'] })
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      toast.success('Processo excluído.', {
        className: 'border-l-4 border-l-fonti-accent bg-fonti-accent-hover text-fonti-primary',
      })
    },
    onError: (err: Error) => {
      if (err.message.includes('Sem permissão para excluir')) {
        toast.error('Você não tem permissão para excluir este processo.')
        return
      }
      toast.error(err.message || 'Erro ao excluir processo.')
    },
  })
}
