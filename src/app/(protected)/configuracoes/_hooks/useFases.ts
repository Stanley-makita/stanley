'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/auth/useAuth'
import type { Fase, FaseUpdate } from '@/types/configuracoes'

const supabase = createClient()

// Módulos disponíveis — adicione aqui para novos módulos
export const MODULOS_FASES = [
  { id: 'leads',            label: 'Leads',            descricao: 'Colunas do Kanban de Leads' },
  { id: 'processos',        label: 'Processos',        descricao: 'Etapas do pipeline de crédito' },
  { id: 'fila_operacional', label: 'Fila Operacional', descricao: 'Etapas da fila operacional' },
] as const

export type ModuloFase = typeof MODULOS_FASES[number]['id']

// Retorna fases filtradas por módulo (ou todas se modulo omitido)
export function useFases(modulo?: string) {
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['fases', modulo ?? 'todos', usuario?.empresa_id],
    queryFn: async (): Promise<Fase[]> => {
      let query = supabase
        .from('fases')
        .select('*')
        .eq('empresa_id', usuario!.empresa_id)
        .eq('ativo', true)
        .order('ordem', { ascending: true })

      if (modulo) query = query.eq('modulo', modulo)

      const { data, error } = await query
      if (error) throw error
      return data
    },
    staleTime: 60_000,
    enabled: !!usuario,
  })
}

export function useReordenarFases() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (fases: Array<{ id: string; ordem: number }>) => {
      const { error } = await supabase.rpc('reordenar_fases', {
        fases_input: fases,
      })
      if (error) throw error
    },
    onMutate: async (novaOrdem) => {
      // Cancela todas as queries de fases
      await queryClient.cancelQueries({ queryKey: ['fases'] })
      // Atualiza otimisticamente em todos os caches de módulo
      queryClient.setQueriesData<Fase[]>({ queryKey: ['fases'] }, (old) =>
        old?.map((f) => {
          const nova = novaOrdem.find((n) => n.id === f.id)
          return nova ? { ...f, ordem: nova.ordem } : f
        }).sort((a, b) => a.ordem - b.ordem) ?? []
      )
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['fases'] }),
  })
}

export function useCriarFase() {
  const queryClient = useQueryClient()
  const { usuario } = useAuth()

  return useMutation({
    mutationFn: async (fase: {
      nome: string
      cor?: string
      ordem?: number
      prazo_dias?: number | null
      modulo: string
      descricao?: string
      notificar_cliente?: boolean
      mensagem_cliente?: string
    }) => {
      if (!usuario?.empresa_id) throw new Error('Usuário não autenticado')

      const { data, error } = await supabase
        .from('fases')
        .insert({
          empresa_id: usuario.empresa_id,
          nome: fase.nome,
          cor: fase.cor ?? '#C2AA6A',
          ordem: fase.ordem ?? 999,
          prazo_dias: fase.prazo_dias ?? null,
          modulo: fase.modulo,
          ativo: true,
        })
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['fases'] }),
  })
}

export function useAtualizarFase() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...update }: FaseUpdate & { id: string }) => {
      const { error } = await supabase.from('fases').update(update).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['fases'] }),
  })
}

export function useExcluirFase() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('fases').update({ ativo: false }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['fases'] }),
  })
}
