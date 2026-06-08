'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'

interface ExcluirPessoaInput {
  pessoaId: string
  motivo: string
}

export function useExcluirPessoa() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ pessoaId, motivo }: ExcluirPessoaInput) => {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token ?? ''

      const res = await fetch(`/api/pessoas/${pessoaId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ motivo }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? `HTTP ${res.status}`)
      }
    },
    onSuccess: (_, { pessoaId }) => {
      queryClient.invalidateQueries({ queryKey: ['pessoas'] })
      queryClient.invalidateQueries({ queryKey: ['pessoa', pessoaId] })
      toast.success('Pessoa excluída com sucesso.', {
        className: 'border-l-4 border-l-red-400',
      })
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido'
      toast.error(`Erro ao excluir pessoa: ${msg}`)
    },
  })
}
