'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import type { SolicitacaoOperacional, StatusSolicitacao, TipoSolicitacao, PrioridadeSolicitacao } from '@/types/solicitacoes-operacionais'

interface FiltrosFila {
  tipo?: TipoSolicitacao
  status?: StatusSolicitacao
  prioridade?: PrioridadeSolicitacao
  todasDaEmpresa?: boolean
  incluirConcluidas?: boolean
}

const JOINS = `
  *,
  responsavel:usuarios!responsavel_id(id, nome),
  solicitante:usuarios!solicitante_id(id, nome),
  lead:leads!lead_id(id, nome),
  processo:processos!processo_id(id, nome_imovel, numero_processo),
  pessoa:pessoas!pessoa_id(id, nome)
`

const ORDEM_PRIORIDADE: Record<string, number> = { urgente: 0, alta: 1, normal: 2, baixa: 3 }

export function useSolicitacoesFila(filtros: FiltrosFila = {}) {
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['solicitacoes', 'fila', usuario?.id, usuario?.empresa_id, filtros],
    queryFn: async (): Promise<SolicitacaoOperacional[]> => {
      let query = supabase
        .from('solicitacoes_operacionais')
        .select(JOINS)
        .eq('empresa_id', usuario!.empresa_id)
        .is('deleted_at', null)
        .not('status', 'in', '("concluido","cancelado")')

      if (!filtros.todasDaEmpresa) {
        query = query.eq('responsavel_id', usuario!.id)
      }

      if (filtros.tipo) query = query.eq('tipo', filtros.tipo)
      if (filtros.status) query = query.eq('status', filtros.status)
      if (filtros.prioridade) query = query.eq('prioridade', filtros.prioridade)

      query = query.order('created_at', { ascending: false })

      const { data, error } = await query
      if (error) throw error

      // Prioridade como critério primário; dentro de cada prioridade, mais recente primeiro (já ordenado pelo banco)
      return (data as unknown as SolicitacaoOperacional[]).slice().sort((a, b) =>
        (ORDEM_PRIORIDADE[a.prioridade] ?? 9) - (ORDEM_PRIORIDADE[b.prioridade] ?? 9)
      )
    },
    enabled: !!usuario,
  })
}

export function useSolicitacoesConcluidasFila(filtros: Omit<FiltrosFila, 'incluirConcluidas' | 'status'> = {}) {
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['solicitacoes', 'fila-concluidas', usuario?.id, usuario?.empresa_id, filtros],
    queryFn: async (): Promise<SolicitacaoOperacional[]> => {
      let query = supabase
        .from('solicitacoes_operacionais')
        .select(JOINS)
        .eq('empresa_id', usuario!.empresa_id)
        .is('deleted_at', null)
        .in('status', ['concluido', 'cancelado'])

      if (!filtros.todasDaEmpresa) {
        query = query.eq('responsavel_id', usuario!.id)
      }

      if (filtros.tipo) query = query.eq('tipo', filtros.tipo)
      if (filtros.prioridade) query = query.eq('prioridade', filtros.prioridade)

      query = query.order('concluido_em', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(50)

      const { data, error } = await query
      if (error) throw error

      return data as unknown as SolicitacaoOperacional[]
    },
    enabled: !!usuario,
  })
}
