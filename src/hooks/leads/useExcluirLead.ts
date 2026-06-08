'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

interface ExcluirLeadInput {
  leadId: string
  faseId: string
  motivo: string
}

export function useExcluirLead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ leadId, motivo }: ExcluirLeadInput) => {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? `HTTP ${res.status}`)
      }
    },
    onSuccess: (_, { leadId, faseId }) => {
      queryClient.invalidateQueries({ queryKey: ['leads', 'fase', faseId] })
      queryClient.invalidateQueries({ queryKey: ['leads', 'todos'] })
      queryClient.invalidateQueries({ queryKey: ['leads', leadId] })
      toast.success('Lead excluído com sucesso.', {
        className: 'border-l-4 border-l-red-400',
      })
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido'
      toast.error(`Erro ao excluir lead: ${msg}`)
    },
  })
}
