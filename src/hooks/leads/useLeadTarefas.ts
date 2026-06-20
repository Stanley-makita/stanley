'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

export interface LeadTarefa {
  id: string
  lead_id: string
  empresa_id: string
  titulo: string
  descricao: string | null
  categoria: string
  prioridade: 'baixa' | 'media' | 'alta' | 'urgente'
  status: 'pendente' | 'concluida' | 'cancelada'
  responsavel_id: string | null
  data_prazo: string | null
  horario_inicio: string | null
  horario_termino: string | null
  concluida: boolean
  concluida_em: string | null
  created_at: string
  responsavel?: { nome: string } | null
}

export interface LeadTarefaComentario {
  id: string
  tarefa_id: string
  texto: string
  created_at: string
  usuario?: { nome: string } | null
}

// ── Leitura ──────────────────────────────────────────────

export function useLeadTarefas(leadId: string) {
  return useQuery({
    queryKey: ['leads', leadId, 'tarefas'],
    queryFn: async (): Promise<LeadTarefa[]> => {
      const { data, error } = await supabase
        .from('lead_tarefas')
        .select('*, responsavel:usuarios!responsavel_id(nome)')
        .eq('lead_id', leadId)
        .is('deleted_at', null)
        .order('concluida', { ascending: true })
        .order('data_prazo', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
    enabled: !!leadId,
  })
}

export function useLeadTarefaComentarios(tarefaId: string | null) {
  return useQuery({
    queryKey: ['tarefas', tarefaId, 'comentarios'],
    queryFn: async (): Promise<LeadTarefaComentario[]> => {
      const { data, error } = await supabase
        .from('lead_tarefa_comentarios')
        .select('*, usuario:usuarios!usuario_id(nome)')
        .eq('tarefa_id', tarefaId!)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data
    },
    enabled: !!tarefaId,
  })
}

// ── Criação ───────────────────────────────────────────────

export function useCriarLeadTarefa(leadId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      titulo: string
      descricao?: string
      categoria?: string
      prioridade?: LeadTarefa['prioridade']
      responsavel_id?: string
      data_prazo?: string
      horario_inicio?: string
      horario_termino?: string
    }) => {
      const { error } = await supabase.rpc('criar_lead_tarefa', {
        p_lead_id:     leadId,
        p_titulo:      input.titulo,
        p_descricao:   input.descricao   ?? null,
        p_categoria:   input.categoria   ?? 'contato',
        p_prioridade:  input.prioridade  ?? 'media',
        p_responsavel: input.responsavel_id ?? null,
        p_data_prazo:  input.data_prazo  ?? null,
      })
      if (error) throw error

      // Horários: atualiza diretamente após criar (RPC não tem esses campos ainda)
      if ((input.horario_inicio || input.horario_termino) && !error) {
        // Pega o ID recém criado pela última tarefa do lead
        const { data: ultima } = await supabase
          .from('lead_tarefas')
          .select('id')
          .eq('lead_id', leadId)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()
        if (ultima) {
          await supabase
            .from('lead_tarefas')
            .update({
              horario_inicio:  input.horario_inicio  ?? null,
              horario_termino: input.horario_termino ?? null,
            })
            .eq('id', ultima.id)
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads', leadId, 'tarefas'] })
      toast.success('Tarefa criada.', {
        className: 'border-l-4 border-l-fonti-accent bg-fonti-accent-hover text-fonti-primary',
      })
    },
    onError: (err: unknown) => {
      console.error('[useCriarLeadTarefa]', err)
      toast.error('Erro ao criar tarefa.')
    },
  })
}

// ── Edição ────────────────────────────────────────────────

export function useEditarLeadTarefa(leadId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id: string
      titulo?: string
      descricao?: string
      categoria?: string
      prioridade?: LeadTarefa['prioridade']
      responsavel_id?: string
      data_prazo?: string
      horario_inicio?: string | null
      horario_termino?: string | null
    }) => {
      const { error } = await supabase.rpc('editar_lead_tarefa', {
        p_tarefa_id:       input.id,
        p_titulo:          input.titulo          ?? null,
        p_descricao:       input.descricao       ?? null,
        p_categoria:       input.categoria       ?? null,
        p_prioridade:      input.prioridade      ?? null,
        p_responsavel_id:  input.responsavel_id  ?? null,
        p_data_prazo:      input.data_prazo      ?? null,
        p_horario_inicio:  input.horario_inicio  ?? null,
        p_horario_termino: input.horario_termino ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads', leadId, 'tarefas'] })
      toast.success('Tarefa atualizada.', {
        className: 'border-l-4 border-l-fonti-accent bg-fonti-accent-hover text-fonti-primary',
      })
    },
    onError: (err: unknown) => {
      console.error('[useEditarLeadTarefa]', err)
      toast.error('Erro ao editar tarefa.')
    },
  })
}

// ── Conclusão ─────────────────────────────────────────────

export function useConcluirLeadTarefa(leadId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (tarefaId: string) => {
      const { error } = await supabase.rpc('concluir_lead_tarefa', { p_tarefa_id: tarefaId })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads', leadId, 'tarefas'] })
    },
    onError: (err: unknown) => {
      console.error('[useConcluirLeadTarefa]', err)
      toast.error('Erro ao concluir tarefa.')
    },
  })
}

// ── Exclusão ──────────────────────────────────────────────

export function useExcluirLeadTarefa(leadId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (tarefaId: string) => {
      const { error } = await supabase.rpc('excluir_lead_tarefa', { p_tarefa_id: tarefaId })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads', leadId, 'tarefas'] })
      toast.success('Tarefa excluída.')
    },
    onError: (err: unknown) => {
      console.error('[useExcluirLeadTarefa]', err)
      toast.error('Erro ao excluir tarefa.')
    },
  })
}

// ── Comentários ───────────────────────────────────────────

export function useComentarLeadTarefa(tarefaId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (texto: string) => {
      const { error } = await supabase.rpc('comentar_lead_tarefa', {
        p_tarefa_id: tarefaId,
        p_texto:     texto,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tarefas', tarefaId, 'comentarios'] })
    },
    onError: (err: unknown) => {
      console.error('[useComentarLeadTarefa]', err)
      toast.error('Erro ao enviar comentário.')
    },
  })
}
