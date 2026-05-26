'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { toast } from 'sonner'

export interface ProcessoContrato {
  id: string
  empresa_id: string
  processo_id: string
  tipo_modelo: string
  titulo: string
  conteudo_html: string
  criado_por: string
  created_at: string
  updated_at: string
}

export function useProcessoContrato(processoId: string) {
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['processo-contrato', processoId],
    queryFn: async (): Promise<ProcessoContrato | null> => {
      const { data, error } = await supabase
        .from('processo_contratos')
        .select('*')
        .eq('processo_id', processoId)
        .eq('empresa_id', usuario!.empresa_id)
        .maybeSingle()

      if (error) throw error
      return data
    },
    enabled: !!usuario?.empresa_id && !!processoId,
  })
}

export function useSalvarContrato(processoId: string) {
  const { usuario } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: { tipo_modelo: string; titulo: string; conteudo_html: string }) => {
      const { error } = await supabase
        .from('processo_contratos')
        .upsert(
          {
            processo_id: processoId,
            empresa_id: usuario!.empresa_id,
            criado_por: usuario!.id,
            ...payload,
          },
          { onConflict: 'processo_id' },
        )

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processo-contrato', processoId] })
      toast.success('Contrato salvo com sucesso.')
    },
    onError: () => {
      toast.error('Não foi possível salvar o contrato. Tente novamente.')
    },
  })
}
