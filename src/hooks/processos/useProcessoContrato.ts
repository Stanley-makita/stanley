'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { toast } from 'sonner'

export interface ProcessoContrato {
  id: string
  empresa_id: string
  processo_id: string
  tipo_modelo: string
  titulo: string
  conteudo_html: string
  criado_por: string
  versao: number
  created_at: string
  updated_at: string
  clicksign_status: string | null
  clicksign_signed_url: string | null
  clicksign_enviado_em: string | null
  clicksign_assinado_em: string | null
  resumo_negociacao_json: import('@/lib/contratos/entenderNegociacao').ResumoNegociacao | null
  plano_contrato_json: unknown | null
}

/**
 * Etapa "Compreensão da Negociação": chama a IA (via API route, que já lê os
 * documentos/OCR do processo) e devolve o resumo estruturado — NÃO persiste.
 * Persistência só acontece em useConfirmarEntendimento, depois que o usuário
 * revisar e confirmar.
 */
export function useEntenderNegociacao(processoId: string) {
  return useMutation({
    mutationFn: async (descricao: string) => {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`/api/processos/${processoId}/contratos/entender`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ descricao }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Erro ao entender a negociação.')
      return json.resumo as import('@/lib/contratos/entenderNegociacao').ResumoNegociacao
    },
    onError: (error) => {
      console.error('[contratos] erro ao entender negociação:', error)
      toast.error(error instanceof Error ? error.message : 'Erro ao entender a negociação.')
    },
  })
}

/**
 * Confirma o resumo estruturado — cria (1ª vez) ou atualiza (revisões
 * seguintes, antes de construir a minuta) o rascunho de contrato com
 * resumo_negociacao_json. É "patrimônio" do negócio, não estado de tela.
 */
export function useConfirmarEntendimento(processoId: string) {
  const { usuario } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: {
      rascunhoId: string | null
      tipoContrato: string
      resumo: import('@/lib/contratos/entenderNegociacao').ResumoNegociacao
    }): Promise<string> => {
      if (payload.rascunhoId) {
        const { error } = await supabase
          .from('processo_contratos')
          .update({ resumo_negociacao_json: payload.resumo, updated_at: new Date().toISOString() })
          .eq('id', payload.rascunhoId)
        if (error) throw error
        return payload.rascunhoId
      }

      const { data: existentes } = await supabase
        .from('processo_contratos')
        .select('versao')
        .eq('processo_id', processoId)
      const maxVersao = Math.max(0, ...(existentes ?? []).map((c) => c.versao ?? 1))

      const { data, error } = await supabase
        .from('processo_contratos')
        .insert({
          processo_id: processoId,
          empresa_id: usuario!.empresa_id,
          criado_por: usuario!.id,
          tipo_modelo: payload.tipoContrato,
          titulo: 'Rascunho',
          conteudo_html: '',
          resumo_negociacao_json: payload.resumo,
          versao: maxVersao + 1,
        })
        .select('id')
        .single()
      if (error) throw error
      return data.id as string
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processo-contratos', processoId] })
    },
    onError: (error) => {
      console.error('[contratos] erro ao confirmar entendimento:', error)
      toast.error('Erro ao salvar o entendimento da negociação.')
    },
  })
}

export function useProcessoContratos(processoId: string) {
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['processo-contratos', processoId],
    queryFn: async (): Promise<ProcessoContrato[]> => {
      const { data, error } = await supabase
        .from('processo_contratos')
        .select('*')
        .eq('processo_id', processoId)
        .eq('empresa_id', usuario!.empresa_id)
        .order('created_at', { ascending: true })

      if (error) throw error
      return data ?? []
    },
    enabled: !!usuario?.empresa_id && !!processoId,
  })
}

export function useSalvarContrato(processoId: string) {
  const { usuario } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: {
      id?: string
      tipo_modelo: string
      titulo: string
      conteudo_html: string
    }): Promise<string> => {
      if (payload.id) {
        const { error } = await supabase
          .from('processo_contratos')
          .update({
            titulo: payload.titulo,
            conteudo_html: payload.conteudo_html,
            updated_at: new Date().toISOString(),
          })
          .eq('id', payload.id)
        if (error) throw error
        return payload.id
      }

      // Novo contrato: calcular próxima versão
      const { data: existentes } = await supabase
        .from('processo_contratos')
        .select('versao')
        .eq('processo_id', processoId)
      const maxVersao = Math.max(0, ...(existentes ?? []).map((c) => c.versao ?? 1))

      const { data, error } = await supabase
        .from('processo_contratos')
        .insert({
          processo_id: processoId,
          empresa_id: usuario!.empresa_id,
          criado_por: usuario!.id,
          tipo_modelo: payload.tipo_modelo,
          titulo: payload.titulo,
          conteudo_html: payload.conteudo_html,
          versao: maxVersao + 1,
        })
        .select('id')
        .single()
      if (error) throw error
      return data.id as string
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processo-contratos', processoId] })
      toast.success('Contrato salvo com sucesso.')
    },
    onError: () => {
      toast.error('Não foi possível salvar o contrato. Tente novamente.')
    },
  })
}

/**
 * Etapa "Plano do Contrato": a partir do resumo já confirmado (lido direto do
 * rascunho salvo), devolve a estrutura de cláusulas prevista — ainda sem
 * persistir. Persistência acontece em useConfirmarPlano, depois que o usuário
 * revisar e confirmar (mesma filosofia da etapa anterior).
 */
export function useGerarPlanoContrato(processoId: string) {
  return useMutation({
    mutationFn: async (contratoId: string) => {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`/api/processos/${processoId}/contratos/${contratoId}/plano`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Erro ao planejar o contrato.')
      return json.plano as import('@/lib/contratos/planejarContrato').PlanoContrato
    },
    onError: (error) => {
      console.error('[contratos] erro ao planejar contrato:', error)
      toast.error(error instanceof Error ? error.message : 'Erro ao planejar o contrato.')
    },
  })
}

export function useConfirmarPlano(processoId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: { contratoId: string; plano: import('@/lib/contratos/planejarContrato').PlanoContrato }) => {
      const { error } = await supabase
        .from('processo_contratos')
        .update({ plano_contrato_json: payload.plano, updated_at: new Date().toISOString() })
        .eq('id', payload.contratoId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processo-contratos', processoId] })
    },
    onError: (error) => {
      console.error('[contratos] erro ao confirmar plano:', error)
      toast.error('Erro ao salvar o plano do contrato.')
    },
  })
}
