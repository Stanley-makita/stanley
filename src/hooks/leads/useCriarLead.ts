'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/hooks/auth/useAuth'
import { type Lead } from '@/types/leads'
import { toast } from 'sonner'

interface CriarLeadInput {
  nome: string
  telefone: string
  email?: string
  cpf?: string
  fase_id: string
  responsavel_id?: string
  origem: Lead['origem']
  valor_pretendido?: number
  observacoes?: string
}

export function useCriarLead() {
  const queryClient = useQueryClient()
  const { usuario } = useAuth()

  return useMutation({
    mutationFn: async (input: CriarLeadInput): Promise<Lead> => {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        if (res.status === 409) {
          throw new Error(err.detail ?? 'Lead duplicado: já existe um lead ativo para esta pessoa nesta fase.')
        }
        throw new Error(err.error ?? `HTTP ${res.status}`)
      }

      return res.json()
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['leads', 'fase', data.fase_id] })
      queryClient.invalidateQueries({ queryKey: ['pessoas', usuario?.empresa_id] })
      toast.success('Lead criado com sucesso!', {
        className: 'border-l-4 border-l-[#C2AA6A] bg-[#E7E0C4] text-[#253B29]',
      })
    },
    onError: (err: unknown) => {
      console.error('[useCriarLead] erro:', err)
      const msg = err instanceof Error ? err.message : 'Erro desconhecido'
      toast.error(`Erro ao criar lead: ${msg}`)
    },
  })
}