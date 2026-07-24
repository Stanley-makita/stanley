'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { type ProcessoComentario } from '@/types/processos'
import { type AnexoEntidade } from '@/lib/documentos/anexoEntidade'
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
      const comentarios = data ?? []
      if (comentarios.length === 0) return comentarios

      const { data: vinculos, error: vinculosError } = await supabase
        .from('documento_vinculos')
        .select('entidade_id, documento:documentos(id, nome_original, mime_type, storage_path, storage_bucket)')
        .eq('entidade_tipo', 'processo_comentario')
        .in('entidade_id', comentarios.map((c) => c.id))
      if (vinculosError) throw vinculosError

      const anexosPorComentario = new Map<string, AnexoEntidade[]>()
      for (const v of vinculos ?? []) {
        const doc = Array.isArray(v.documento) ? v.documento[0] : v.documento
        if (!doc) continue
        const lista = anexosPorComentario.get(v.entidade_id) ?? []
        lista.push(doc as AnexoEntidade)
        anexosPorComentario.set(v.entidade_id, lista)
      }

      return comentarios.map((c) => ({ ...c, anexos: anexosPorComentario.get(c.id) }))
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
    }): Promise<string> => {
      const { data, error } = await supabase
        .from('processo_comentarios')
        .insert({
          processo_id: processoId,
          empresa_id: usuario!.empresa_id,
          usuario_id: usuario!.id,
          ...input,
        })
        .select('id')
        .single()

      if (error) throw error
      return data.id
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processos', processoId, 'comentarios'] })
    },
    onError: () => {
      toast.error('Erro ao adicionar comentário.')
    },
  })
}