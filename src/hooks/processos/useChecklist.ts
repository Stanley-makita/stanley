'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'

export interface ChecklistItemDB {
  id: string
  template_id: string
  descricao: string
  obrigatorio: boolean
  ordem: number
  ativo: boolean
  acao_ao_completar: string | null
}

export interface ChecklistTemplateDB {
  id: string
  fase_id: string
  nome: string
  ativo: boolean
}

export interface ChecklistExecucao {
  id: string
  processo_id: string
  item_id: string
  marcado: boolean
  marcado_por: string | null
  marcado_em: string | null
  usuario?: { nome: string } | null
}

// Busca template + itens de uma fase
export function useChecklistTemplate(faseId: string | null | undefined) {
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['checklist-template', faseId, usuario?.empresa_id],
    enabled: !!faseId && !!usuario?.empresa_id,
    queryFn: async () => {
      const { data: template, error: tErr } = await supabase
        .from('checklist_templates')
        .select('id, fase_id, nome, ativo')
        .eq('empresa_id', usuario!.empresa_id)
        .eq('fase_id', faseId!)
        .eq('ativo', true)
        .maybeSingle()

      if (tErr) throw tErr
      if (!template) return { template: null, itens: [] }

      const { data: itens, error: iErr } = await supabase
        .from('checklist_items')
        .select('id, template_id, descricao, obrigatorio, ordem, ativo, acao_ao_completar')
        .eq('template_id', template.id)
        .eq('ativo', true)
        .order('ordem', { ascending: true })

      if (iErr) throw iErr
      return { template: template as ChecklistTemplateDB, itens: (itens ?? []) as ChecklistItemDB[] }
    },
    staleTime: 30_000,
  })
}

// Busca execuções de um processo (o que foi marcado)
export function useChecklistExecucoes(processoId: string) {
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['checklist-execucoes', processoId],
    enabled: !!processoId && !!usuario?.empresa_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('checklist_execucoes')
        .select('id, processo_id, item_id, marcado, marcado_por, marcado_em, usuario:usuarios!marcado_por(nome)')
        .eq('processo_id', processoId)
        .eq('empresa_id', usuario!.empresa_id)

      if (error) throw error
      return (data ?? []) as unknown as ChecklistExecucao[]
    },
  })
}

// Mutation: marcar ou desmarcar um item (upsert)
export function useMarcarChecklistItem(processoId: string) {
  const queryClient = useQueryClient()
  const { usuario } = useAuth()

  return useMutation({
    mutationFn: async ({ item, marcado }: { item: ChecklistItemDB; marcado: boolean }) => {
      const { error } = await supabase
        .from('checklist_execucoes')
        .upsert(
          {
            processo_id: processoId,
            item_id:     item.id,
            empresa_id:  usuario!.empresa_id,
            marcado,
            marcado_por: marcado ? usuario!.id : null,
            marcado_em:  marcado ? new Date().toISOString() : null,
          },
          { onConflict: 'processo_id,item_id' }
        )
      if (error) throw error

      if (marcado && item.acao_ao_completar === 'emitido') {
        const { error: errP } = await supabase
          .from('processos')
          .update({
            status_emissao: 'emitido',
            data_emissao: new Date().toISOString().slice(0, 10),
          })
          .eq('id', processoId)
        if (errP) throw errP
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checklist-execucoes', processoId] })
      queryClient.invalidateQueries({ queryKey: ['processo', processoId] })
      queryClient.invalidateQueries({ queryKey: ['processos'] })
    },
  })
}

// Hook derivado: retorna se há itens obrigatórios pendentes para uma fase/processo
export function useChecklistPendencias(processoId: string, faseId: string | null | undefined) {
  const { data: tmpl, isLoading: tmplLoading } = useChecklistTemplate(faseId)
  const { data: execucoes = [], isLoading: execLoading } = useChecklistExecucoes(processoId)

  const itens = tmpl?.itens ?? []
  const marcadosSet = new Set(execucoes.filter(e => e.marcado).map(e => e.item_id))

  const itensObrigatoriosPendentes = itens.some(i => i.obrigatorio && !marcadosSet.has(i.id))

  return {
    itensObrigatoriosPendentes,
    isLoading: tmplLoading || execLoading,
  }
}
