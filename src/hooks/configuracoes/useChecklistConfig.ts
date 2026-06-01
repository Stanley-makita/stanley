'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import type { ChecklistItemDB, ChecklistTemplateDB } from '@/hooks/processos/useChecklist'

export interface TemplateComFase extends ChecklistTemplateDB {
  fase: { id: string; nome: string; cor: string | null; ordem: number }
  itens: ChecklistItemDB[]
}

// Busca todos os templates de um módulo com seus itens
export function useChecklistTemplates(modulo: string) {
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['checklist-templates-config', modulo, usuario?.empresa_id],
    enabled: !!modulo && !!usuario?.empresa_id,
    queryFn: async () => {
      // 1. Buscar fases do módulo
      const { data: fases, error: fErr } = await supabase
        .from('fases')
        .select('id, nome, cor, ordem')
        .eq('empresa_id', usuario!.empresa_id)
        .eq('modulo', modulo)
        .eq('ativo', true)
        .order('ordem', { ascending: true })
      if (fErr) throw fErr

      if (!fases || fases.length === 0) return []

      // 2. Buscar templates dessas fases
      const faseIds = fases.map(f => f.id)
      const { data: templates, error: tErr } = await supabase
        .from('checklist_templates')
        .select('id, fase_id, nome, ativo')
        .eq('empresa_id', usuario!.empresa_id)
        .in('fase_id', faseIds)
      if (tErr) throw tErr

      // 3. Buscar itens de todos os templates
      const templateIds = (templates ?? []).map(t => t.id)
      let itens: ChecklistItemDB[] = []
      if (templateIds.length > 0) {
        const { data: itensData, error: iErr } = await supabase
          .from('checklist_items')
          .select('id, template_id, descricao, obrigatorio, ordem, ativo')
          .in('template_id', templateIds)
          .eq('ativo', true)
          .order('ordem', { ascending: true })
        if (iErr) throw iErr
        itens = (itensData ?? []) as ChecklistItemDB[]
      }

      // 4. Montar resultado: uma entrada por fase (com ou sem template)
      return fases.map(fase => {
        const template = (templates ?? []).find(t => t.fase_id === fase.id) ?? null
        const faseItens = template ? itens.filter(i => i.template_id === template.id) : []
        return {
          fase,
          template: template as ChecklistTemplateDB | null,
          itens: faseItens,
        }
      })
    },
    staleTime: 10_000,
  })
}

// Criar ou garantir template para uma fase (upsert)
export function useGarantirTemplate() {
  const qc = useQueryClient()
  const { usuario } = useAuth()

  return useMutation({
    mutationFn: async ({ faseId, modulo }: { faseId: string; nome: string; modulo: string }) => {
      const { data: existing } = await supabase
        .from('checklist_templates')
        .select('id')
        .eq('empresa_id', usuario!.empresa_id)
        .eq('fase_id', faseId)
        .maybeSingle()

      if (existing) return existing.id

      const { data: fase } = await supabase
        .from('fases')
        .select('nome')
        .eq('id', faseId)
        .single()

      const { data: novo, error } = await supabase
        .from('checklist_templates')
        .insert({
          empresa_id: usuario!.empresa_id,
          fase_id:    faseId,
          nome:       `Checklist — ${fase?.nome ?? 'Fase'}`,
          ativo:      true,
        })
        .select('id')
        .single()
      if (error) throw error
      return novo.id
    },
    onSuccess: (_, { modulo }) => {
      qc.invalidateQueries({ queryKey: ['checklist-templates-config', modulo] })
    },
  })
}

// Adicionar item a um template
export function useCriarChecklistItem() {
  const qc = useQueryClient()
  const { usuario } = useAuth()

  return useMutation({
    mutationFn: async ({
      templateId, descricao, obrigatorio, ordem, modulo,
    }: { templateId: string; descricao: string; obrigatorio: boolean; ordem: number; modulo: string }) => {
      const { error } = await supabase
        .from('checklist_items')
        .insert({
          template_id: templateId,
          empresa_id:  usuario!.empresa_id,
          descricao:   descricao.trim(),
          obrigatorio,
          ordem,
          ativo:       true,
        })
      if (error) throw error
      return modulo
    },
    onSuccess: (modulo) => {
      qc.invalidateQueries({ queryKey: ['checklist-templates-config', modulo] })
      qc.invalidateQueries({ queryKey: ['checklist-template'] })
    },
  })
}

// Editar item
export function useAtualizarChecklistItem() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      itemId, descricao, obrigatorio, modulo,
    }: { itemId: string; descricao: string; obrigatorio: boolean; modulo: string }) => {
      const { error } = await supabase
        .from('checklist_items')
        .update({ descricao: descricao.trim(), obrigatorio })
        .eq('id', itemId)
      if (error) throw error
      return modulo
    },
    onSuccess: (modulo) => {
      qc.invalidateQueries({ queryKey: ['checklist-templates-config', modulo] })
      qc.invalidateQueries({ queryKey: ['checklist-template'] })
    },
  })
}

// Soft-delete item (ativo = false)
export function useExcluirChecklistItem() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ itemId, modulo }: { itemId: string; modulo: string }) => {
      const { error } = await supabase
        .from('checklist_items')
        .update({ ativo: false })
        .eq('id', itemId)
      if (error) throw error
      return modulo
    },
    onSuccess: (modulo) => {
      qc.invalidateQueries({ queryKey: ['checklist-templates-config', modulo] })
      qc.invalidateQueries({ queryKey: ['checklist-template'] })
    },
  })
}

// Reordenar itens (batch update de ordem)
export function useReordenarChecklistItens() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ itens, modulo }: { itens: { id: string; ordem: number }[]; modulo: string }) => {
      // Atualiza cada item individualmente (sem RPC por enquanto)
      await Promise.all(
        itens.map(({ id, ordem }) =>
          supabase.from('checklist_items').update({ ordem }).eq('id', id)
        )
      )
      return modulo
    },
    onSuccess: (modulo) => {
      qc.invalidateQueries({ queryKey: ['checklist-templates-config', modulo] })
      qc.invalidateQueries({ queryKey: ['checklist-template'] })
    },
  })
}
