'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { type LeadHistorico } from '@/types/leads'

export interface LeadTimelineItem {
  id: string
  kind: 'historico' | 'simulacao' | 'documento' | 'solicitacao'
  tipo: string
  created_at: string
  descricao: string | null
  usuario?: { nome: string } | null
  titulo?: string | null
  status?: string | null
  resultado_json?: Record<string, unknown> | null
  ocr_status?: string | null
  fase_anterior?: { nome: string } | null
  fase_nova?: { nome: string } | null
}

export function useLeadHistorico(leadId: string, tipos?: string[]) {
  return useQuery({
    queryKey: ['leads', leadId, 'historico', tipos ?? 'todos'],
    queryFn: async (): Promise<LeadTimelineItem[]> => {
      const [historicoRes, simulacoesRes, documentosRes, solicitacoesRes] = await Promise.all([
        (async () => {
          let query = supabase
            .from('lead_historico')
            .select(`
              *,
              usuario:usuarios!usuario_id(nome),
              fase_anterior:fases!fase_anterior_id(nome),
              fase_nova:fases!fase_nova_id(nome)
            `)
            .eq('lead_id', leadId)
            .order('created_at', { ascending: false })

          if (tipos && tipos.length > 0) {
            query = query.in('tipo', tipos)
          }

          const { data, error } = await query
          if (error) throw error
          return (data ?? []).map((item) => ({
            id: item.id,
            kind: 'historico' as const,
            tipo: item.tipo,
            created_at: item.created_at,
            descricao: item.descricao,
            usuario: item.usuario,
            fase_anterior: item.fase_anterior,
            fase_nova: item.fase_nova,
          }))
        })(),
        (async () => {
          const { data, error } = await supabase
            .from('simulacoes_central')
            .select('id, tipo, banco, resultado_json, created_at, status')
            .eq('lead_id', leadId)
            .order('created_at', { ascending: false })

          if (error) throw error
          return (data ?? []).map((item) => ({
            id: item.id,
            kind: 'simulacao' as const,
            tipo: item.tipo,
            created_at: item.created_at,
            descricao: item.banco ? `Simulação • ${item.banco}` : 'Simulação salva',
            status: item.status,
            resultado_json: item.resultado_json as Record<string, unknown> | null,
          }))
        })(),
        (async () => {
          const { data, error } = await supabase
            .from('documentos_clientes')
            .select('id, nome_original, ocr_status, created_at')
            .eq('lead_id', leadId)
            .order('created_at', { ascending: false })

          if (error) throw error
          return (data ?? []).map((item) => ({
            id: item.id,
            kind: 'documento' as const,
            tipo: 'documento',
            created_at: item.created_at,
            titulo: item.nome_original,
            descricao: 'Documento anexado',
            ocr_status: item.ocr_status,
          }))
        })(),
        (async () => {
          const { data, error } = await supabase
            .from('solicitacoes_operacionais')
            .select('id, titulo, status, created_at')
            .eq('lead_id', leadId)
            .order('created_at', { ascending: false })

          if (error) throw error
          return (data ?? []).map((item) => ({
            id: item.id,
            kind: 'solicitacao' as const,
            tipo: 'solicitacao',
            created_at: item.created_at,
            titulo: item.titulo,
            descricao: 'Solicitação operacional',
            status: item.status,
          }))
        })(),
      ])

      return [...historicoRes, ...simulacoesRes, ...documentosRes, ...solicitacoesRes]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    },
    enabled: !!leadId,
    refetchInterval: 30000,
  })
}