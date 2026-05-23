'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { type ProcessoComentario } from '@/types/processos'
import { toast } from 'sonner'

export function useProcessoComentarios(processoId: string) {
  return useQuery({
    queryKey: ['processos', processoId, 'comentarios'],
    queryFn: async (): Promise<ProcessoComentario[]> => {
      const { data, error } = await supabase
        .from('processo_comentarios')
        .select('*, usuario:usuarios!usuario_id(nome)')
        .eq('processo_id', processoId)
        .order('created_at', { ascending: false })

      if (error) throw error
      return data
    },
    enabled: !!processoId,
  })
}

export function useAdicionarComentario(processoId: string) {
  const queryClient = useQueryClient()
  const { usuario } = useAuth()

  return useMutation({
    mutationFn: async (input: {
      tipo: ProcessoComentario['tipo']
      texto: string
      notificar_cliente: boolean
    }) => {
      const { error } = await supabase
        .from('processo_comentarios')
        .insert({
          processo_id: processoId,
          empresa_id: usuario!.empresa_id,
          usuario_id: usuario!.id,
          ...input,
        })

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processos', processoId, 'comentarios'] })
    },
    onError: () => {
      toast.error('Erro ao adicionar comentário.')
    },
  })
}