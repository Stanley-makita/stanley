'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/auth/useAuth'
import type { TipoChecklistItem } from '@/app/(protected)/configuracoes/_hooks/useFaseChecklists'

const supabase = createClient()

export interface ChecklistItemComStatus {
  id: string          // checklist_items.id
  descricao: string
  tipo: TipoChecklistItem
  link_externo: string | null
  obrigatorio: boolean
  bloqueia_avanco: boolean
  ordem: number
  // da execução (pode não existir ainda)
  execucao_id: string | null
  concluido: boolean
  resultado: string | null
  observacao: string | null
  anexo_id: string | null
  concluido_por: string | null
  concluido_at: string | null
  concluido_por_nome: string | null
}

export function useLeadChecklist(leadId: string, faseId: string | null | undefined) {
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['lead_checklist', leadId, faseId],
    queryFn: async (): Promise<ChecklistItemComStatus[]> => {
      if (!faseId) return []

      // 1. Buscar template da fase
      const { data: template } = await supabase
        .from('checklist_templates')
        .select('id')
        .eq('fase_id', faseId)
        .eq('empresa_id', usuario!.empresa_id)
        .maybeSingle()

      if (!template) return []

      // 2. Buscar itens do template
      const { data: itens, error: errItens } = await supabase
        .from('checklist_items')
        .select('id, descricao, tipo, link_externo, obrigatorio, bloqueia_avanco, ordem')
        .eq('template_id', template.id)
        .eq('ativo', true)
        .order('ordem', { ascending: true })

      if (errItens) throw errItens
      if (!itens || itens.length === 0) return []

      // 3. Buscar execuções já existentes para este lead
      const itemIds = itens.map((i) => i.id)
      const { data: execucoes } = await supabase
        .from('checklist_execucoes')
        .select('id, item_id, marcado, resultado, observacao, anexo_id, marcado_por, marcado_em, usuario:usuarios!marcado_por(nome)')
        .eq('lead_id', leadId)
        .in('item_id', itemIds)

      // 4. Combinar
      const execMap = new Map(execucoes?.map((e) => [e.item_id, e]) ?? [])

      return itens.map((item) => {
        const ex = execMap.get(item.id)
        return {
          id: item.id,
          descricao: item.descricao,
          tipo: item.tipo as TipoChecklistItem,
          link_externo: item.link_externo,
          obrigatorio: item.obrigatorio,
          bloqueia_avanco: item.bloqueia_avanco,
          ordem: item.ordem,
          execucao_id: ex?.id ?? null,
          concluido: ex?.marcado ?? false,
          resultado: ex?.resultado ?? null,
          observacao: ex?.observacao ?? null,
          anexo_id: ex?.anexo_id ?? null,
          concluido_por: ex?.marcado_por ?? null,
          concluido_at: ex?.marcado_em ?? null,
          concluido_por_nome: (ex?.usuario as { nome?: string } | null)?.nome ?? null,
        }
      })
    },
    enabled: !!leadId && !!faseId && !!usuario,
    staleTime: 30_000,
  })
}

export function useCompletarChecklistItem() {
  const queryClient = useQueryClient()
  const { usuario } = useAuth()

  return useMutation({
    mutationFn: async (input: {
      lead_id: string
      fase_id: string
      item_id: string
      execucao_id: string | null
      concluido: boolean
      resultado?: string | null
      observacao?: string | null
      anexo_id?: string | null
    }) => {
      const agora = new Date().toISOString()

      if (input.execucao_id) {
        // Atualizar execução existente
        const { data, error } = await supabase
          .from('checklist_execucoes')
          .update({
            marcado:    input.concluido,
            resultado:  input.resultado ?? null,
            observacao: input.observacao ?? null,
            anexo_id:   input.anexo_id ?? null,
            marcado_por: input.concluido ? usuario!.id : null,
            marcado_em:  input.concluido ? agora : null,
          })
          .eq('id', input.execucao_id)
          .select()
          .single()
        if (error) throw error
        return data
      } else {
        // Criar nova execução
        const { data, error } = await supabase
          .from('checklist_execucoes')
          .insert({
            lead_id:    input.lead_id,
            item_id:    input.item_id,
            empresa_id: usuario!.empresa_id,
            marcado:    input.concluido,
            resultado:  input.resultado ?? null,
            observacao: input.observacao ?? null,
            anexo_id:   input.anexo_id ?? null,
            marcado_por: input.concluido ? usuario!.id : null,
            marcado_em:  input.concluido ? agora : null,
          })
          .select()
          .single()
        if (error) throw error

        // Registrar no historico do lead (não bloqueia se falhar)
        if (input.concluido) {
          supabase.from('lead_historico').insert({
            lead_id:    input.lead_id,
            empresa_id: usuario!.empresa_id,
            usuario_id: usuario!.id,
            tipo:       'acao_operacional',
            descricao:  `Item do checklist concluído${input.resultado ? ': ' + input.resultado : ''}`,
          }).then(({ error }) => { if (error) console.warn('[checklist] histórico:', error.message) })
        }

        return data
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['lead_checklist', variables.lead_id, variables.fase_id] })
      queryClient.invalidateQueries({ queryKey: ['leads', variables.lead_id] })
    },
  })
}
