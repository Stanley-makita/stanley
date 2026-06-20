'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { type ProcessoSimulacao } from '@/types/processos'
import { toast } from 'sonner'

export function useSimulacoes(processoId: string) {
  return useQuery({
    queryKey: ['processos', processoId, 'simulacoes'],
    queryFn: async (): Promise<ProcessoSimulacao[]> => {
      const { data, error } = await supabase
        .from('processo_simulacoes')
        .select('*, usuario:usuarios!usuario_id(nome)')
        .eq('processo_id', processoId)
        .order('criado_em', { ascending: false })
      if (error) throw error
      return data
    },
    enabled: !!processoId,
  })
}

export function useAdicionarSimulacao(processoId: string) {
  const queryClient = useQueryClient()
  const { usuario } = useAuth()

  return useMutation({
    mutationFn: async ({ descricao, arquivo }: { descricao: string; arquivo?: File }) => {
      let arquivo_path: string | null = null
      let arquivo_nome: string | null = null
      let arquivo_mime: string | null = null

      if (arquivo) {
        const ext = arquivo.name.split('.').pop()
        const path = `${usuario!.empresa_id}/simulacoes/${processoId}/${Date.now()}_${arquivo.name}`
        const { error: uploadError } = await supabase.storage
          .from('documentos')
          .upload(path, arquivo, { contentType: arquivo.type })
        if (uploadError) throw uploadError
        arquivo_path = path
        arquivo_nome = arquivo.name
        arquivo_mime = arquivo.type
      }

      const { error } = await supabase.from('processo_simulacoes').insert({
        processo_id: processoId,
        empresa_id: usuario!.empresa_id,
        descricao,
        arquivo_path,
        arquivo_nome,
        arquivo_mime,
        usuario_id: usuario!.id,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processos', processoId, 'simulacoes'] })
      toast.success('Simulação adicionada.', {
        className: 'border-l-4 border-l-fonti-accent bg-fonti-accent-hover text-fonti-primary',
      })
    },
    onError: () => toast.error('Erro ao adicionar simulação.'),
  })
}

export function useRemoverSimulacao(processoId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, arquivo_path }: { id: string; arquivo_path: string | null }) => {
      if (arquivo_path) {
        await supabase.storage.from('documentos').remove([arquivo_path])
      }
      const { error } = await supabase.from('processo_simulacoes').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processos', processoId, 'simulacoes'] })
      toast.success('Simulação removida.')
    },
    onError: () => toast.error('Erro ao remover simulação.'),
  })
}
