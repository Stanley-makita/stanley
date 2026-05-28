'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { toast } from 'sonner'
import type { ProcessoTarefa } from '@/types/processos'

export interface ProcessoTarefaComentario {
  id: string
  tarefa_id: string
  texto: string
  created_at: string
  usuario?: { nome: string } | null
}

export function useProcessoTarefaById(tarefaId: string | null) {
  return useQuery({
    queryKey: ['processo-tarefa', tarefaId],
    enabled: !!tarefaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('processo_tarefas')
        .select(`
          *,
          responsavel:usuarios!responsavel_id(nome),
          processo:processos!processo_id(
            id, numero_processo, nome_imovel,
            compradores:processo_compradores(nome, principal)
          )
        `)
        .eq('id', tarefaId!)
        .single()
      if (error) throw error
      return data as ProcessoTarefa & {
        responsavel?: { nome: string } | null
        processo?: {
          id: string
          numero_processo: string
          nome_imovel: string
          compradores: { nome: string; principal: boolean }[]
        } | null
      }
    },
  })
}

export function useLeadTarefaById(tarefaId: string | null) {
  return useQuery({
    queryKey: ['lead-tarefa', tarefaId],
    enabled: !!tarefaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lead_tarefas')
        .select(`
          *,
          responsavel:usuarios!responsavel_id(nome),
          lead:leads!lead_id(id, nome)
        `)
        .eq('id', tarefaId!)
        .single()
      if (error) throw error
      return data as any
    },
  })
}

export function useProcessoTarefaComentarios(tarefaId: string | null) {
  return useQuery({
    queryKey: ['processo-tarefa-comentarios', tarefaId],
    enabled: !!tarefaId,
    queryFn: async (): Promise<ProcessoTarefaComentario[]> => {
      const { data, error } = await supabase
        .from('processo_tarefa_comentarios')
        .select('*, usuario:usuarios!usuario_id(nome)')
        .eq('tarefa_id', tarefaId!)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data
    },
  })
}

export function useComentarProcessoTarefa(tarefaId: string) {
  const queryClient = useQueryClient()
  const { usuario } = useAuth()

  return useMutation({
    mutationFn: async (texto: string) => {
      const { error } = await supabase
        .from('processo_tarefa_comentarios')
        .insert({
          tarefa_id:  tarefaId,
          empresa_id: usuario!.empresa_id,
          usuario_id: usuario!.id,
          texto,
        })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processo-tarefa-comentarios', tarefaId] })
    },
    onError: (err: unknown) => {
      console.error('[useComentarProcessoTarefa]', err)
      toast.error('Erro ao enviar comentário.')
    },
  })
}

export function useEditarProcessoTarefa(tarefaId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      titulo?: string
      descricao?: string | null
      categoria?: string
      prioridade?: ProcessoTarefa['prioridade']
      responsavel_id?: string | null
      data_prazo?: string | null
      horario_inicio?: string | null
      horario_termino?: string | null
    }) => {
      const { error } = await supabase
        .from('processo_tarefas')
        .update(input)
        .eq('id', tarefaId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processo-tarefa', tarefaId] })
      queryClient.invalidateQueries({ queryKey: ['agenda-tarefas'] })
      queryClient.invalidateQueries({ queryKey: ['negocios', 'dashboard', 'tarefas-proximas'] })
      toast.success('Tarefa atualizada.', {
        className: 'border-l-4 border-l-[#C2AA6A] bg-[#E7E0C4] text-[#253B29]',
      })
    },
    onError: (err: unknown) => {
      console.error('[useEditarProcessoTarefa]', err)
      toast.error('Erro ao editar tarefa.')
    },
  })
}

export function useConcluirProcessoTarefaById(tarefaId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (concluida: boolean) => {
      const { error } = await supabase
        .from('processo_tarefas')
        .update({
          concluida,
          status: concluida ? 'concluida' : 'pendente',
          concluida_em: concluida ? new Date().toISOString() : null,
        })
        .eq('id', tarefaId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processo-tarefa', tarefaId] })
      queryClient.invalidateQueries({ queryKey: ['processos'] })
      queryClient.invalidateQueries({ queryKey: ['agenda-tarefas'] })
      queryClient.invalidateQueries({ queryKey: ['negocios', 'dashboard', 'tarefas-proximas'] })
    },
    onError: (err: unknown) => {
      console.error('[useConcluirProcessoTarefaById]', err)
      toast.error('Erro ao atualizar tarefa.')
    },
  })
}
