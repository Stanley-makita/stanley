'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/auth/useAuth'

const supabase = createClient()

export type TipoChecklistItem = 'manual' | 'restritivos' | 'documento' | 'formulario' | 'link_externo'

export interface ChecklistItem {
  id: string
  template_id: string
  empresa_id: string
  descricao: string
  tipo: TipoChecklistItem
  link_externo: string | null
  obrigatorio: boolean
  bloqueia_avanco: boolean
  acao_ao_completar: string | null
  ordem: number
  ativo: boolean
  criado_em: string
}

interface ChecklistTemplate {
  id: string
  empresa_id: string
  fase_id: string
  nome: string
  ativo: boolean
}

export const TIPOS_CHECKLIST: Record<TipoChecklistItem, string> = {
  manual:       'Passo manual',
  restritivos:  'Consulta de restritivos',
  documento:    'Solicitar documento',
  formulario:   'Gerar formulário',
  link_externo: 'Link externo',
}

// Retorna (ou cria) o template da fase + seus itens
export function useFaseChecklists(faseId: string | null | undefined) {
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['fase_checklists', faseId],
    queryFn: async (): Promise<{ template: ChecklistTemplate | null; itens: ChecklistItem[] }> => {
      // Buscar template da fase
      const { data: template } = await supabase
        .from('checklist_templates')
        .select('*')
        .eq('fase_id', faseId!)
        .eq('empresa_id', usuario!.empresa_id)
        .maybeSingle()

      if (!template) return { template: null, itens: [] }

      const { data: itens, error } = await supabase
        .from('checklist_items')
        .select('*')
        .eq('template_id', template.id)
        .eq('ativo', true)
        .order('ordem', { ascending: true })

      if (error) throw error
      return { template, itens: itens as ChecklistItem[] }
    },
    staleTime: 60_000,
    enabled: !!faseId && !!usuario,
  })
}

// Garante que o template existe antes de adicionar itens
async function garantirTemplate(faseId: string, empresaId: string): Promise<string> {
  const { data: existing } = await supabase
    .from('checklist_templates')
    .select('id')
    .eq('fase_id', faseId)
    .eq('empresa_id', empresaId)
    .maybeSingle()

  if (existing) return existing.id

  const { data, error } = await supabase
    .from('checklist_templates')
    .insert({ fase_id: faseId, empresa_id: empresaId, nome: 'Checklist da fase' })
    .select('id')
    .single()

  if (error) throw error
  return data.id
}

export function useCriarChecklistItem() {
  const queryClient = useQueryClient()
  const { usuario } = useAuth()

  return useMutation({
    mutationFn: async (input: {
      fase_id: string
      descricao: string
      tipo?: TipoChecklistItem
      link_externo?: string | null
      obrigatorio?: boolean
      bloqueia_avanco?: boolean
      acao_ao_completar?: string | null
      ordem?: number
    }) => {
      const templateId = await garantirTemplate(input.fase_id, usuario!.empresa_id)
      const { data, error } = await supabase
        .from('checklist_items')
        .insert({
          template_id: templateId,
          empresa_id: usuario!.empresa_id,
          descricao: input.descricao,
          tipo: input.tipo ?? 'manual',
          link_externo: input.link_externo ?? null,
          obrigatorio: input.obrigatorio ?? false,
          bloqueia_avanco: input.bloqueia_avanco ?? false,
          acao_ao_completar: input.acao_ao_completar || null,
          ordem: input.ordem ?? 999,
        })
        .select()
        .single()
      if (error) throw error
      return { ...data, fase_id: input.fase_id }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['fase_checklists', data.fase_id] })
    },
  })
}

export function useAtualizarChecklistItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      id: string
      fase_id: string
      descricao?: string
      tipo?: TipoChecklistItem
      link_externo?: string | null
      obrigatorio?: boolean
      bloqueia_avanco?: boolean
      acao_ao_completar?: string | null
    }) => {
      const { id, fase_id, ...campos } = input
      const atualizar = {
        ...campos,
        acao_ao_completar: campos.acao_ao_completar || null,
      }
      const { data, error } = await supabase
        .from('checklist_items')
        .update(atualizar)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return { ...data, fase_id }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['fase_checklists', data.fase_id] })
    },
  })
}

export function useExcluirChecklistItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: { id: string; fase_id: string }) => {
      const { error } = await supabase
        .from('checklist_items')
        .update({ ativo: false })
        .eq('id', input.id)
      if (error) throw error
      return input
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['fase_checklists', data.fase_id] })
    },
  })
}
